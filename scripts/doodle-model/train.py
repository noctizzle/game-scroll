# Trains the doodle model on the drawings fetch.py downloaded and writes src/kit/doodle-model.js.
# Usage: python3 train.py [folder] [drawings of each thing]      (THREADS=4 and EPOCHS=6 by default)
import os, sys, numpy as np, torch, torch.nn as nn, torch.nn.functional as F, json, time, base64
torch.manual_seed(1); np.random.seed(1); torch.set_num_threads(int(os.environ.get('THREADS', 4)))
HERE = os.path.dirname(os.path.abspath(__file__))
DIR = sys.argv[1] if len(sys.argv) > 1 else 'qd-data'
PER = int(sys.argv[2]) if len(sys.argv) > 2 else 7000
E = int(os.environ.get('EPOCHS', 6))
C1, C2, C3, D = 32, 64, 128, 256            # the three convolutions and the dense layer (doodle.js reads these from the file)
CLASSES = json.load(open(os.path.join(HERE, 'classes.json')))
X = []; Y = []
for i, c in enumerate(CLASSES):
    a = np.load(os.path.join(DIR, c.replace(' ', '_') + '.npy'))[:PER]; X.append(a); Y.append(np.full(len(a), i))
X = np.concatenate(X); Y = np.concatenate(Y)                       # drawings stay as bytes: 200 things x 7,000 is 1.1 GB
p = np.random.permutation(len(X)); X = X[p]; Y = Y[p]
nt = len(X) // 20
def pic(a): return a.view(-1, 1, 28, 28).float() / 255
Xte, Yte = torch.from_numpy(X[:nt]), torch.from_numpy(Y[:nt]); Xtr, Ytr = torch.from_numpy(X[nt:]), torch.from_numpy(Y[nt:])
print(len(CLASSES), 'things,', len(Xtr), 'drawings to learn from,', len(Xte), 'held out', flush=True)

class Net(nn.Module):
    def __init__(s, n):
        super().__init__(); s.c1 = nn.Conv2d(1, C1, 3, padding=1); s.c2 = nn.Conv2d(C1, C2, 3, padding=1); s.c3 = nn.Conv2d(C2, C3, 3, padding=1)
        s.f1 = nn.Linear(C3 * 3 * 3, D); s.f2 = nn.Linear(D, n); s.drop = nn.Dropout(.2)
    def forward(s, x):
        x = F.max_pool2d(F.relu(s.c1(x)), 2); x = F.max_pool2d(F.relu(s.c2(x)), 2); x = F.max_pool2d(F.relu(s.c3(x)), 2)
        return s.f2(s.drop(F.relu(s.f1(x.flatten(1)))))
m = Net(len(CLASSES)); opt = torch.optim.Adam(m.parameters(), 2e-3)
def aug(x):   # a little turn, size and shift, so a drawing needn't be neat
    b = x.shape[0]; ang = (torch.rand(b) - .5) * 0.35; sc = 1 / (0.8 + torch.rand(b) * 0.35); tx = (torch.rand(b) - .5) * 0.25; ty = (torch.rand(b) - .5) * 0.25
    th = torch.stack([torch.stack([sc * torch.cos(ang), -sc * torch.sin(ang), tx], 1), torch.stack([sc * torch.sin(ang), sc * torch.cos(ang), ty], 1)], 1)
    g = F.affine_grid(th, x.shape, align_corners=False); return F.grid_sample(x, g, align_corners=False)
def test(model):
    model.eval(); out = []
    with torch.no_grad():
        for i in range(0, len(Xte), 4096): out.append(model(pic(Xte[i:i + 4096])))
    return torch.cat(out)
B = 256; steps = E * (len(Xtr) // B); sched = torch.optim.lr_scheduler.OneCycleLR(opt, 3e-3, total_steps=steps)
for ep in range(E):
    t = time.time(); m.train(); perm = torch.randperm(len(Xtr))
    for n, i in enumerate(range(0, len(Xtr) - B + 1, B)):
        idx = perm[i:i + B]; x = pic(Xtr[idx])
        if ep < E - 1: x = aug(x)
        loss = F.cross_entropy(m(x), Ytr[idx]); opt.zero_grad(); loss.backward(); opt.step(); sched.step()
        if n % 500 == 0: print(f"  epoch {ep} step {n}/{len(Xtr) // B} loss {loss.item():.3f} {time.time() - t:.0f}s", flush=True)
    acc = (test(m).argmax(1) == Yte).float().mean().item()
    print(f"epoch {ep} loss {loss.item():.3f} test {acc:.3f} {time.time() - t:.0f}s", flush=True)
    torch.save(m.state_dict(), DIR + '/model.pt')
# export int8 per tensor
out = {'classes': CLASSES, 'layers': []}
blob = bytearray()
for k, v in m.state_dict().items():
    a = v.numpy().astype(np.float32).ravel(); s = float(np.abs(a).max() / 127) or 1e-6
    q = np.clip(np.round(a / s), -127, 127).astype(np.int8)
    out['layers'].append({'name': k, 'shape': list(v.shape), 'scale': s, 'offset': len(blob)}); blob += q.tobytes()
open(DIR + '/doodle.bin', 'wb').write(bytes(blob)); json.dump(out, open(DIR + '/doodle.json', 'w'))
# how right the int8 model is: among everything, in its first three, and when a game asks about five things
sd = m.state_dict()
for L in out['layers']:
    q = np.frombuffer(bytes(blob[L['offset']:L['offset'] + int(np.prod(L['shape']))]), dtype=np.int8).astype(np.float32) * L['scale']
    sd[L['name']] = torch.tensor(q.reshape(L['shape']))
m.load_state_dict(sd); logits = test(m)
top1 = (logits.argmax(1) == Yte).float().mean().item()
top3 = (logits.topk(3, 1).indices == Yte[:, None]).any(1).float().mean().item()
g = torch.Generator().manual_seed(2); n = len(CLASSES); ok = 0; tries = 20000
for j in torch.randint(0, len(Yte), (tries,), generator=g).tolist():
    y = int(Yte[j]); others = [k for k in torch.randperm(n, generator=g).tolist() if k != y][:4]
    ok += int(logits[j, [y] + others].argmax().item() == 0)
per = [(CLASSES[k], ((logits.argmax(1) == Yte) & (Yte == k)).sum().item() / max(1, (Yte == k).sum().item())) for k in range(n)]
per.sort(key=lambda r: r[1])
np.save(DIR + '/test_x.npy', pic(Xte[:200]).numpy()); np.save(DIR + '/test_y.npy', Yte[:200].numpy()); np.save(DIR + '/test_logits.npy', logits[:200].numpy())
report = {'things': n, 'top1': round(top1, 4), 'top3': round(top3, 4), 'among5': round(ok / tries, 4), 'bytes': len(blob), 'hardest': [[c, round(a, 3)] for c, a in per[:12]]}
json.dump(report, open(DIR + '/report.json', 'w')); print(json.dumps(report), flush=True)
# the model as a JS module for src/kit/doodle.js
js = "// Made by training on Google's Quick, Draw! drawings (CC BY 4.0, quickdraw.withgoogle.com/data):\n// a small network of int8 weights for src/kit/doodle.js. Generated by scripts/doodle-model/train.py; don't edit by hand.\n"
js += "export const MODEL = " + json.dumps({"classes": out["classes"], "layers": out["layers"]}, separators=(',', ':'))[:-1] + ',"data":"' + base64.b64encode(bytes(blob)).decode() + '"};\n'
open(os.path.join(HERE, '..', '..', 'src', 'kit', 'doodle-model.js'), 'w').write(js)
