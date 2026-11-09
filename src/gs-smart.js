// The on-device smarts of gs (src/gamescroll.js) in their own small chunk: hearing sounds and spoken
// words, recognising doodles, and the phone's own built-in AI. Loaded the first time a game needs one.
export * as hear from './kit/hear.js';
export * as doodle from './kit/doodle.js';
export * as phoneai from './kit/phoneai.js';
