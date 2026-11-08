// The open-source parts that ship inside the app, shown under Settings › Licence › Open-source parts.
// Every package in package.json "dependencies" must be listed here (except the app's own plugins in
// plugins/), with the licence its package.json gives. scripts/licence-check.mjs checks this in every
// pull request (`npm run licences`), so the list can't fall behind when a dependency is added.
// spdx: the SPDX id the check compares with each package's own licence field.

export const OPEN_SOURCE = [
  { name: 'three.js', for: '3D graphics', licence: 'MIT', spdx: 'MIT', packages: ['three'] },
  { name: 'Capacitor', for: 'the phone app and its haptics, motion, location and share plugins', licence: 'MIT', spdx: 'MIT',
    packages: ['@capacitor/android', '@capacitor/ios', '@capacitor/core', '@capacitor/app', '@capacitor/device',
      '@capacitor/geolocation', '@capacitor/haptics', '@capacitor/motion', '@capacitor/share'] },
  { name: 'Rapier', for: '2D and 3D physics', licence: 'Apache 2.0', spdx: 'Apache-2.0',
    packages: ['@dimforge/rapier2d-compat', '@dimforge/rapier3d-compat'] },
  { name: 'MediaPipe', for: 'face and hand tracking, and its models', licence: 'Apache 2.0', spdx: 'Apache-2.0',
    packages: ['@mediapipe/tasks-vision'] },
  { name: 'Yuka', for: 'game AI', licence: 'MIT', spdx: 'MIT', packages: ['yuka'] },
  { name: 'Tone.js', for: 'music', licence: 'MIT', spdx: 'MIT', packages: ['tone'] },
  { name: 'ZzFX', for: 'sound effects, by Frank Force', licence: 'MIT', spdx: 'MIT', packages: ['zzfx'] },
  { name: 'simplex-noise', for: 'noise for terrain and motion', licence: 'MIT', spdx: 'MIT', packages: ['simplex-noise'] },
  { name: 'troika-three-text', for: '3D text', licence: 'MIT', spdx: 'MIT', packages: ['troika-three-text'] },
  { name: 'three.quarks', for: '3D particle effects', licence: 'MIT', spdx: 'MIT', packages: ['three.quarks'] },
  { name: 'postprocessing', for: '3D screen effects', licence: 'zlib', spdx: 'Zlib', packages: ['postprocessing'] },
  { name: 'Press Start 2P font', for: 'pixel text', licence: 'SIL OFL 1.1', spdx: 'OFL-1.1', packages: ['@fontsource/press-start-2p'] },
  { name: 'Rubik font', for: 'app text', licence: 'SIL OFL 1.1', spdx: 'OFL-1.1', packages: ['@fontsource/rubik'] },
];
