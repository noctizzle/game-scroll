// The libraries behind gs.fx3d, in one chunk that loads the first time a game uses 3D effects.
export { Text } from 'troika-three-text';
export * as Q from 'three.quarks';
export { OutlinePass } from 'three/examples/jsm/postprocessing/OutlinePass.js';
export { GlitchPass } from 'three/examples/jsm/postprocessing/GlitchPass.js';
export { AfterimagePass } from 'three/examples/jsm/postprocessing/AfterimagePass.js';
export { BokehPass } from 'three/examples/jsm/postprocessing/BokehPass.js';
export { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { FONT_URLS } from './fonts.js';
export const FONTS = FONT_URLS;
