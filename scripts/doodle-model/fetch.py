import urllib.parse, urllib.request, numpy as np, os, sys, concurrent.futures as cf
CLASSES = ["sword","star","circle","triangle","square","house","tree","cat","fish","bird","sun","moon","cloud","lightning","umbrella","key","ladder","bridge","car","sailboat","airplane","flower","apple","snowman","mountain","hat","crown","envelope","eye","smiley face","fork","hammer","axe","door","candle","clock","cup","diamond","banana","bicycle","spider","snake","rainbow","octopus","light bulb","hot air balloon"]
N = 12000
DIR = sys.argv[1] if len(sys.argv) > 1 else 'qd-data'; os.makedirs(DIR, exist_ok=True)
def get(c):
    out = os.path.join(DIR, c.replace(' ','_') + '.npy')
    if os.path.exists(out): return c
    u = "https://storage.googleapis.com/quickdraw_dataset/full/numpy_bitmap/" + urllib.parse.quote(c) + ".npy"
    head = urllib.request.urlopen(urllib.request.Request(u, headers={"Range": "bytes=0-9"})).read()
    hl = int.from_bytes(head[8:10], "little"); off = 10 + hl
    data = urllib.request.urlopen(urllib.request.Request(u, headers={"Range": f"bytes={off}-{off + 784*N - 1}"})).read()
    a = np.frombuffer(data, dtype=np.uint8).reshape(-1, 784)
    np.save(out, a); return c
with cf.ThreadPoolExecutor(8) as ex:
    for c in ex.map(get, CLASSES): print(c, flush=True)
