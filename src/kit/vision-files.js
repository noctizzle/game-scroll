// The files face and hand tracking need (see scripts/fetch-ml.mjs). Bump ML_VERSION when any change.
export const ML_VERSION = 'mediapipe-1.2.2';
export const ML_FILES = [
  { name: 'vision_wasm_internal.wasm', from: 'node_modules/@mediapipe/tasks-vision/wasm/vision_wasm_internal.wasm' },
  { name: 'face_landmarker.task', url: 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task' },
  { name: 'hand_landmarker.task', url: 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task' },
];
