// gs.models: things made in code, ready to drop in a Next Gen scene, so a game stays one .js file
// with no image or model files. Materials from recipes (wood, brick, rust...), and (more to come)
// props, trees, buildings, sculpted shapes and people built from them.
// Each part lives in src/kit/models/.
export { material, NAMES as materials } from './models/materials.js';
export { warm as ready } from './models/cache.js';
export { wear, curvature } from './models/wear.js';
export { prop, PROP_NAMES as props } from './models/props.js';
export { sculpt } from './models/sculpt.js';
