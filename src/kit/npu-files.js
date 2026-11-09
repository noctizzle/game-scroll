// The ONNX models the phone's AI chip runs for face and hand tracking and sound recognition (npu.js),
// made by scripts/npu-models/convert.py and served from the games host at ml/<NPU_VERSION>/. Bump
// NPU_VERSION when any of them change.
export const NPU_VERSION = 'npu-1';
export const NPU_FILES = ['face-detect.onnx', 'face-mesh.onnx', 'face-shapes.onnx', 'palm-detect.onnx', 'hand-mesh.onnx', 'yamnet.onnx', 'yamnet-labels.txt'];
