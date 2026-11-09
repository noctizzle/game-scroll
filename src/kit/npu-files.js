// The ONNX models the phone's AI chip runs for face and hand tracking and sound recognition (npu.js),
// made by scripts/npu-models/convert.py, kept in ml-models/<NPU_VERSION>/ and served from the games host
// at ml/<NPU_VERSION>/ (the npu-models workflow uploads them). The phone apps only run a file whose
// SHA-256 matches the one here. Bump NPU_VERSION when any of them change.
export const NPU_VERSION = 'npu-1';
export const NPU_FILES = {
  'face-detect.onnx': 'b3c0869fb5ca437da8adc8bccbbace8ab58b70c1f44f17b533acb9ec2f4d1275',
  'face-mesh.onnx': '13b029b88c25fabca8fa939c9c1eb6daa93a41cb78699882dd897fe93cbd1889',
  'face-shapes.onnx': '9072d018b459dab0e38420ee303277b2cf530a36e8c7f848737c0e2a4e454b42',
  'palm-detect.onnx': '0d3b9235406dc3375667588bb237c1b8f7616a401a10cae101f3e083e0ae494b',
  'hand-mesh.onnx': '6ae9935c20532bce19e6537653be32c4e60d8a50ad9cb2e74a6e9f31f0535dee',
  'yamnet.onnx': '98cf000c2babee7176b2cf338d0b1559bf6939bdf373328c7a1cc9c6fc7edabb',
  'yamnet-labels.txt': '8e1267a120c1932b7273c0d0e0c5529edbb9a35512b437b1c8982baa59047051',
};
