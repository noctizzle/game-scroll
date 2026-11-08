// The 3D parts of gs (src/gamescroll.js), in their own chunk so the app opens without three.js.
// Loaded the first time a game needs one of them.
export * as toon from './kit/toon3d.js';
export * as hd from './kit/hd3d.js';
export * as ar from './kit/ar3d.js';
export * as bricks from './kit/bricks.js';
export * as physics3d from './kit/physics3d.js';
export * as fx3d from './kit/fx3d.js';
export * as camera from './kit/camera.js';
export * as nav3d from './kit/nav3d.js';
export * as characters from './kit/characters.js';
export * as THREE from 'three';
