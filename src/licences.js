// The open-source parts that ship inside the app, shown under Settings › Licence › Open-source parts.
// Every package in package.json "dependencies" must be listed here (except the app's own plugins in
// plugins/), with the licence its package.json gives. scripts/licence-check.mjs checks this in every
// pull request (`npm run licences`), so the list can't fall behind when a dependency is added.
// spdx: the SPDX id the check compares with each package's own licence field.
// vendored: for code copied into the repo instead of installed (the file it lives in).
// notice: a copyright line to show with it, for licences that ask for one in the app (BSD).

export const OPEN_SOURCE = [
  { name: 'three.js', for: '3D graphics', licence: 'MIT', spdx: 'MIT', packages: ['three'] },
  { name: 'Capacitor', for: 'the phone app and its haptics, motion, location and share plugins', licence: 'MIT', spdx: 'MIT',
    packages: ['@capacitor/android', '@capacitor/ios', '@capacitor/core', '@capacitor/app', '@capacitor/device',
      '@capacitor/geolocation', '@capacitor/haptics', '@capacitor/motion', '@capacitor/share'] },
  { name: 'Rapier', for: '2D and 3D physics', licence: 'Apache 2.0', spdx: 'Apache-2.0',
    packages: ['@dimforge/rapier2d-compat', '@dimforge/rapier3d-compat', '@dimforge/rapier2d-simd-compat', '@dimforge/rapier3d-simd-compat'] },
  { name: 'MediaPipe', for: 'face and hand tracking, and its models', licence: 'Apache 2.0', spdx: 'Apache-2.0',
    packages: ['@mediapipe/tasks-vision'] },
  { name: 'Yuka', for: 'game AI', licence: 'MIT', spdx: 'MIT', packages: ['yuka'] },
  { name: 'Recast Navigation', for: '3D path finding', licence: 'MIT', spdx: 'MIT', packages: ['recast-navigation'] },
  { name: 'PixiJS', for: '2D screen effects and fast sprites', licence: 'MIT', spdx: 'MIT', packages: ['pixi.js'] },
  { name: 'pixi-filters', for: '2D screen effects', licence: 'MIT', spdx: 'MIT', packages: ['pixi-filters'] },
  { name: 'ink (inkjs)', for: 'story dialogue, by inkle', licence: 'MIT', spdx: 'MIT', packages: ['inkjs'] },
  { name: 'lil-gui', for: 'live tweak sliders for game makers (dev builds only)', licence: 'MIT', spdx: 'MIT', packages: ['lil-gui'] },
  { name: 'Snapdragon Game Super Resolution 1', for: 'sharp Next Gen and AR 3D when it is drawn smaller, by Qualcomm', licence: 'BSD 3-Clause', spdx: 'BSD-3-Clause', vendored: 'src/kit/sgsr.js', notice: '© 2023-2025 Qualcomm Innovation Center, Inc.' },
  { name: 'rot.js', for: 'dungeons, caves, mazes and field of view for made levels, by Ondřej Žára', licence: 'BSD 3-Clause', spdx: 'BSD-3-Clause', packages: ['rot-js'], notice: '© 2012-now Ondřej Žára' },
  { name: 'WaveFunctionCollapse (JS)', for: 'tile patterns for made levels, by Kevin Chapelier', licence: 'MIT', spdx: 'MIT', packages: ['wavefunctioncollapse'] },
  { name: 'Tone.js', for: 'music', licence: 'MIT', spdx: 'MIT', packages: ['tone'] },
  { name: 'anime.js', for: 'animation timelines in games, by Julian Garnier', licence: 'MIT', spdx: 'MIT', packages: ['animejs'] },
  { name: 'pitchy (with fft.js)', for: 'hearing sung and whistled notes in mic games', licence: 'MIT', spdx: 'MIT', packages: ['pitchy'] },
  { name: 'Capacitor Text to Speech', for: 'characters that speak, by the Capacitor Community', licence: 'MIT', spdx: 'MIT', packages: ['@capacitor-community/text-to-speech'] },
  { name: 'ZzFX', for: 'sound effects, by Frank Force', licence: 'MIT', spdx: 'MIT', vendored: 'src/kit/zzfx.js' },
  { name: 'simplex-noise', for: 'noise for terrain and motion', licence: 'MIT', spdx: 'MIT', packages: ['simplex-noise'] },
  { name: 'troika-three-text', for: '3D text', licence: 'MIT', spdx: 'MIT', packages: ['troika-three-text'] },
  { name: 'three.quarks', for: '3D particle effects', licence: 'MIT', spdx: 'MIT', packages: ['three.quarks'] },
  { name: 'three-pinata', for: 'breaking things into pieces', licence: 'MIT', spdx: 'MIT', packages: ['@dgreenheck/three-pinata'] },
  { name: 'InstancedMesh2 (with bvh.js)', for: 'big levels: many props, culling and detail levels', licence: 'MIT', spdx: 'MIT', packages: ['@three.ez/instanced-mesh'] },
  { name: 'THREE.Terrain', for: '3D outdoor land and grass', licence: 'MIT', spdx: 'MIT', packages: ['three.terrain.js'] },
  { name: 'Yoga', for: 'in-game menu and HUD layout (flexbox)', licence: 'MIT', spdx: 'MIT', packages: ['yoga-layout'] },
  { name: 'pokersolver', for: 'naming and ranking poker hands', licence: 'MIT', spdx: 'MIT', packages: ['pokersolver'] },
  { name: 'SCOWL word lists (wordlist-english)', for: 'the word game dictionary', licence: 'MIT (word lists: SCOWL licence)', spdx: 'MIT', packages: ['wordlist-english'], notice: '© 2000-2016 Kevin Atkinson and others (SCOWL)' },
  { name: '@2toad/profanity', for: 'keeping rude words out of word games', licence: 'MIT', spdx: 'MIT', packages: ['@2toad/profanity'] },
  { name: 'Press Start 2P font', for: 'pixel text', licence: 'SIL OFL 1.1', spdx: 'OFL-1.1', packages: ['@fontsource/press-start-2p'] },
  { name: 'Rubik font', for: 'app text', licence: 'SIL OFL 1.1', spdx: 'OFL-1.1', packages: ['@fontsource/rubik'] },
];
