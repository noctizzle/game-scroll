// Dialogue for story and RPG games: branching conversations written in ink (inklestudios.com/ink,
// the free story language from the makers of 80 Days, MIT licence), and a typewriter that reveals
// text letter by letter. The kit runs the story; your game draws the box, the portraits and the
// choice buttons.
//
//   const { Story, Typewriter } = gs.story;
//   const TALK = `
//   VAR gate = false
//   Halt! Who goes there? #who:guard
//   * [A friend] -> friend
//   * [Nobody] Very funny. #who:guard #mood:cross
//     -> END
//   == friend ==
//   Then pass, friend.
//   ~ gate = true
//   -> END`;
//   reset() { talk = new Story(TALK); line = talk.next(); tw = new Typewriter(line.text, { speed: 40 }); }   // make it in make() or reset()
//   update(dt) { tw.update(dt); if (tw.ticked) sfx(900, .02); }
//   down(x, y) {
//     if (!tw.done) return tw.skip();                        // first tap shows the whole line
//     if (line.choices.length) talk.choose(pickedChoice(x, y)); // choices: [{ text, index }]
//     if (talk.ended) return close();
//     line = talk.next(); tw.show(line.text);
//   }
//   draw(c) { box(c); text(c, tw.shown, ...); if (tw.done) line.choices.forEach(drawButton); }
//   line.tags: { who: 'guard', mood: 'cross' } from '#who:guard #mood:cross';  talk.vars.gate: ink variables
//
// The ink compiler loads the first time a game uses Story (like physics). Ink basics: plain lines
// are said in order, '*' lines are choices, '== name ==' starts a section and '-> name' jumps to it,
// '~ x = 1' sets a variable, '{x: ...}' tests one. Full guide: github.com/inkle/ink.

import { lazy } from './lazy.js';

const lib = lazy('The story engine', () => import('inkjs/full'));
export const loadStory = () => lib.load();

const parseTags = list => {
  const out = {};
  for (const t of list || []) { const m = String(t).match(/^\s*([^:]+?)\s*:\s*(.*?)\s*$/); if (m) out[m[1]] = m[2]; else out[String(t).trim()] = true; }
  return out;
};

export class Story {
  /** source: the ink script (a string in your game file). */
  constructor(source) {
    const ink = lib.get();
    const c = new ink.Compiler(String(source).replace(/^\n+/, ''));
    this.ink = c.Compile();
    if (!this.ink) throw new Error('Story: the ink script has errors: ' + (c.errors || []).join('; '));
    const v = this.ink.variablesState;
    // ink variables as plain properties: talk.vars.gold, talk.vars.gold = 10
    this.vars = new Proxy({}, { get: (_, k) => v.$(String(k)), set: (_, k, val) => { v.$(String(k), val); return true; } });
  }
  /** More to say (or choices to make)? */
  get ended() { return !this.ink.canContinue && !this.ink.currentChoices.length; }
  /** Choices open now: [{ text, index, tags }]. */
  get choices() { return this.ink.currentChoices.map(ch => ({ text: ch.text, index: ch.index, tags: parseTags(ch.tags) })); }
  /** The next line: { text, tags, choices }. choices is filled when the line is the last before a choice. */
  next() {
    if (!this.ink.canContinue) return { text: '', tags: {}, choices: this.choices };
    const text = this.ink.Continue().trim();
    return { text, tags: parseTags(this.ink.currentTags), choices: this.ink.canContinue ? [] : this.choices };
  }
  /** Picks choice i (its index), then next() carries on from there. */
  choose(i) { this.ink.ChooseChoiceIndex(i); return this; }
  /** Jumps to a section ('== shop =='): talk.go('shop'). */
  go(section) { this.ink.ChoosePathString(section); return this; }
  /** Calls fn when ink runs `~ name(args)` (declare it in the ink as `EXTERNAL name(a)`). */
  bind(name, fn) { this.ink.BindExternalFunction(name, fn); return this; }
  /** Where the story is, as a string (for api.save, if it fits). */
  save() { return this.ink.state.ToJson(); }
  load(json) { this.ink.state.LoadJson(json); return this; }
}

/**
 * Text revealed a letter at a time. speed: letters per second; pause: extra seconds at . ! ? and ,
 * Read shown (the text so far), done, and ticked (true on frames a letter appeared: a blip sound).
 */
export class Typewriter {
  constructor(text = '', { speed = 40, pause = .18 } = {}) { this.speed = speed; this.pause = pause; this.show(text); }
  show(text) { this.text = String(text ?? ''); this.n = 0; this.t = 0; this.wait = 0; this.ticked = false; return this; }
  get shown() { return this.text.slice(0, this.n); }
  get done() { return this.n >= this.text.length; }
  skip() { this.n = this.text.length; return this; }
  update(dt) {
    this.ticked = false;
    if (this.done) return this;
    if (this.wait > 0) { this.wait -= dt; return this; }
    this.t += dt * this.speed;
    while (this.t >= 1 && !this.done) {
      this.t -= 1; const ch = this.text[this.n++];
      if (ch !== ' ') this.ticked = true;
      if ('.!?'.includes(ch)) { this.wait = this.pause * 2; this.t = 0; break; }
      if (ch === ',') { this.wait = this.pause; this.t = 0; break; }
    }
    return this;
  }
}
