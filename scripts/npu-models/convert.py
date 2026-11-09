# Makes the ONNX models the phone's AI chip runs for gs.vision and gs.hear (src/kit/npu.js): Google's
# MediaPipe face and hand landmarker models and YAMNet (Apache-2.0), converted from TFLite with tf2onnx,
# with a fixed batch of 1 (the NPUs want fixed shapes), plain input and output names (input, out0,
# out1...) and the face and hand ones stored as float16 (half the download; inputs and outputs stay
# float32). Each one is checked against the original model on random input before it is written.
#   python -m venv .venv && . .venv/bin/activate && pip install -r scripts/npu-models/requirements.txt
#   python scripts/npu-models/convert.py [outDir]        (default: ml-cache/<NPU_VERSION>/)
# The npu-models workflow runs this and uploads the result to assets.game-scroll.com/ml/<NPU_VERSION>/.
import io, os, re, sys, zipfile, urllib.request, tempfile
import numpy as np, onnx, onnxruntime as ort, tensorflow as tf, tf2onnx
from onnx import shape_inference
from onnxconverter_common import float16

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
VERSION = re.search(r"NPU_VERSION = '([^']+)'", open(os.path.join(ROOT, 'src/kit/npu-files.js')).read()).group(1)
OUT = os.path.join(sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, 'ml-cache'), VERSION)
os.makedirs(OUT, exist_ok=True)
G = 'https://storage.googleapis.com/mediapipe-models/'
SRC = {
  'face_landmarker.task': G + 'face_landmarker/face_landmarker/float16/1/face_landmarker.task',
  'hand_landmarker.task': G + 'hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task',
  'yamnet.tflite': G + 'audio_classifier/yamnet/float32/1/yamnet.tflite',
}
# our name: (download, file inside it, store as float16)
MODELS = {
  'face-detect': ('face_landmarker.task', 'face_detector.tflite', True),
  'face-mesh': ('face_landmarker.task', 'face_landmarks_detector.tflite', True),
  'face-shapes': ('face_landmarker.task', 'face_blendshapes.tflite', True),
  'palm-detect': ('hand_landmarker.task', 'hand_detector.tflite', True),
  'hand-mesh': ('hand_landmarker.task', 'hand_landmarks_detector.tflite', True),
  'yamnet': ('yamnet.tflite', None, False),   # already quantized (QDQ), which the NPUs like as it is
}
got = {k: urllib.request.urlopen(u).read() for k, u in SRC.items()}
tmp = tempfile.mkdtemp()
for name, (src, inner, half) in MODELS.items():
  data = zipfile.ZipFile(io.BytesIO(got[src])).read(inner) if inner else got[src]
  tfl = os.path.join(tmp, name + '.tflite'); open(tfl, 'wb').write(data)
  m, _ = tf2onnx.convert.from_tflite(tfl, opset=17)
  for v in list(m.graph.input) + list(m.graph.output):
    for d in v.type.tensor_type.shape.dim:
      if d.dim_param: d.ClearField('dim_param'); d.dim_value = 1
  orig = [o.name for o in m.graph.output]
  ren = {m.graph.input[0].name: 'input', **{o.name: f'out{i}' for i, o in enumerate(m.graph.output)}}
  for node in m.graph.node:
    node.input[:] = [ren.get(x, x) for x in node.input]; node.output[:] = [ren.get(x, x) for x in node.output]
  for v in list(m.graph.input) + list(m.graph.output): v.name = ren.get(v.name, v.name)
  m = shape_inference.infer_shapes(m)
  if half: m = float16.convert_float_to_float16(m, keep_io_types=True)
  path = os.path.join(OUT, name + '.onnx'); onnx.save(m, path)
  # check it against the original
  it = tf.lite.Interpreter(model_path=tfl); it.allocate_tensors(); i0 = it.get_input_details()[0]
  x = (np.random.rand(*i0['shape']) * (256 if name == 'face-shapes' else 1)).astype(np.float32)
  if name == 'yamnet': x = (.3 * np.sin(2 * np.pi * 180 * np.arange(15600) / 16000) * (1 + np.sin(np.arange(15600) / 400))).astype(np.float32)   # a sound, not noise
  it.set_tensor(i0['index'], x); it.invoke()
  want = {o['name']: it.get_tensor(o['index']) for o in it.get_output_details()}
  s = ort.InferenceSession(path); have = s.run(None, {'input': x.reshape(s.get_inputs()[0].shape)})
  # (YAMNet's sums are done in whole numbers in TFLite and in floats here: its scores differ by a few
  # hundredths, but rank the same; it is checked as a score difference, the others against their range)
  scale = (lambda w: 1) if name == 'yamnet' else (lambda w: np.abs(w).max() + 1e-3)
  worst = max(float(np.abs(want[n].reshape(h.shape) - h).max() / scale(want[n])) for n, h in zip(orig, have))
  print(f'{name}: {os.path.getsize(path) / 1e6:.2f} MB, in {s.get_inputs()[0].shape}, out {[o.shape for o in s.get_outputs()]}, worst difference {worst:.4f} of range')
  if worst > (.1 if name == 'yamnet' else .05): sys.exit(f'{name} does not match the original')
# YAMNet's 521 sound names, from the model's own metadata (one a line, in score order)
open(os.path.join(OUT, 'yamnet-labels.txt'), 'wb').write(zipfile.ZipFile(io.BytesIO(got['yamnet.tflite'])).read('yamnet_label_list.txt'))
print('written to', OUT)
