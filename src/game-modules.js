// The shared modules a game may import, and which of their exports it gets.
//
// Games run inside the app, so they could in principle reach any app code: the wallet, the saved
// progress, settings. Only the modules below are handed to games. Everything else (progress,
// services, hearts, settings ...) is app-only, so a game can't pay itself credits, wipe a player's
// save or change their settings.
//
// Used in three places, so they always agree:
//  - src/remote.js gives streamed games only these modules (and leaves out the HIDDEN exports);
//  - scripts/build-games.mjs refuses to build a game that imports anything else;
//  - scripts/game-lint.mjs flags such imports on pull requests.
//
// Adding a module here is a change to the app (it ships with an app update), so it needs its own PR.
export const GAME_MODULES = [
  'sfx.js', 'util.js', 'palettes.js',
  'kit/device.js', 'kit/gfx.js', 'kit/bricks.js',
  'kit/toon3d.js', 'kit/hd3d.js', 'kit/ar3d.js',
  'kit/juice.js', 'kit/sound.js', 'kit/controls.js', 'kit/physics2d.js', 'kit/geo.js',
];

// Exports of allowed modules that games still don't get: raw storage, the player's sound and haptics settings, and the
// old unrounded location(). Games save with api.save() / api.load() and find the player with
// api.location() instead (see docs/maker-kit.md).
export const HIDDEN = { 'util.js': ['store'], 'sfx.js': ['sound', 'setSound', 'audio'], 'kit/device.js': ['location', 'hapticSettings', 'setHaptics'] };

// Extra features on the `api` a game receives in make(api). A streamed game that uses one is only
// offered to apps that have it (older apps skip the game instead of crashing).
export const API_FEATURES = ['save', 'load', 'clearSave', 'location', 'watchLocation'];

// How precisely a game may know where the player is. A game that calls api.location() or
// api.watchLocation() must say which in its definition (location: 'coarse'), and the feed shows it.
export const LOCATION_LEVELS = ['coarse', 'precise'];
