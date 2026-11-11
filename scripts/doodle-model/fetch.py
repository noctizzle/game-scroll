# Downloads the drawings train.py learns from: N of each thing in classes.json, as 28 x 28 bitmaps,
# from Google's Quick, Draw! dataset (CC BY 4.0). Usage: python3 fetch.py [folder] [N]
import urllib.parse, urllib.request, numpy as np, os, sys, json, concurrent.futures as cf
HERE = os.path.dirname(os.path.abspath(__file__))
CLASSES = json.load(open(os.path.join(HERE, 'classes.json')))
DIR = sys.argv[1] if len(sys.argv) > 1 else 'qd-data'; os.makedirs(DIR, exist_ok=True)
N = int(sys.argv[2]) if len(sys.argv) > 2 else 7000
def get(c):
    out = os.path.join(DIR, c.replace(' ', '_') + '.npy')
    if os.path.exists(out) and len(np.load(out, mmap_mode='r')) >= N: return c
    u = "https://storage.googleapis.com/quickdraw_dataset/full/numpy_bitmap/" + urllib.parse.quote(c) + ".npy"
    for attempt in range(5):
        try:
            head = urllib.request.urlopen(urllib.request.Request(u, headers={"Range": "bytes=0-9"}), timeout=60).read()
            hl = int.from_bytes(head[8:10], "little"); off = 10 + hl
            data = urllib.request.urlopen(urllib.request.Request(u, headers={"Range": f"bytes={off}-{off + 784*N - 1}"}), timeout=300).read()
            a = np.frombuffer(data, dtype=np.uint8).reshape(-1, 784)
            np.save(out, a); return c
        except Exception as e:
            if attempt == 4: raise
            print('again:', c, e, flush=True)
with cf.ThreadPoolExecutor(8) as ex:
    for c in ex.map(get, CLASSES): print(c, flush=True)
