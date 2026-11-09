// The phone's own built-in AI, for flavour: a shopkeeper's greeting, a riddle, a rival's taunt that
// changes every time. It uses the language model that newer phones already have (Apple Foundation
// Models on iPhones with Apple Intelligence, Gemini Nano on Android phones with AICore, the browser's
// built-in model on the web where there is one), so the app downloads nothing and nothing leaves the
// phone. Older phones don't have one: every ask() has a written fallback, and games must work the
// same way without it. Never make play depend on what it says.
//
//   const { PhoneAI } = gs.phoneai;
//   const ai = new PhoneAI({ persona: 'a grumpy old lighthouse keeper', words: 20 });
//   reset() { ai.ask('Greet the player, who just arrived by boat.', { fallback: 'Mind the rocks.' }).then(t => greeting = t); }
//
// Guard rails, always on: the model is told it's a character in a family game (short, kind, no rude
// words, no personal questions, no real people or brands); answers are cut to `words`, anything
// with a link, an email, a number string or a word on the block list is thrown away for the
// fallback; one ask at a time, at most one every 2 seconds per game, and each answer gives up after
// `timeout` seconds. Answers to the same prompt are kept for the round (so asking every frame is cheap).

import { Capacitor, registerPlugin } from '@capacitor/core';

const native = Capacitor.isNativePlatform();
const plugin = native && Capacitor.isPluginAvailable('PhoneAI') ? registerPlugin('PhoneAI') : null;

const RULES = (persona, words) => [
  `You are ${persona || 'a friendly character'} in a short, family-friendly mobile game.`,
  `Answer in at most ${words} words: one or two short sentences, plain text, no lists or emoji.`,
  'Be playful and kind. Cartoon peril is fine; no gore, no rude or scary words, nothing about real people, brands, politics or religion.',
  'Never ask the player personal questions or for any personal information. Stay in character.',
].join(' ');

// words that should never reach a family game, whatever the model says
const BLOCK = /\b(kill(ed|ing)?|blood|die[sd]?|dead|death|gun|suicide|sex\w*|naked|drugs?|beer|wine|drunk|hate|stupid|idiot|damn|hell|crap|shit\w*|fuck\w*|bitch\w*|bastard|ass(hole)?|dick|piss\w*|porn\w*|nazi\w*|racis\w*)\b/i;
const LINKY = /(https?:\/\/|www\.|\S+@\S+\.\w+|\d{4,})/i;

/** Tidies a model's answer, or null if it shouldn't be shown. */
export function tidy(text, words = 30) {
  if (typeof text !== 'string') return null;
  let t = text.replace(/[*_#`>\[\]]/g, '').replace(/\s+/g, ' ').trim().replace(/^["'“”]+|["'“”]+$/g, '');
  if (!t || BLOCK.test(t) || LINKY.test(t)) return null;
  const list = t.split(' ');
  if (list.length > words) { t = list.slice(0, words).join(' '); const end = Math.max(t.lastIndexOf('.'), t.lastIndexOf('!'), t.lastIndexOf('?')); t = end > 10 ? t.slice(0, end + 1) : t.replace(/[,;:]?$/, '…'); }
  return t.slice(0, 240);
}

let webSession = null;
async function web(rules) {
  const LM = typeof window !== 'undefined' && window.LanguageModel;
  if (!LM) return null;
  try {
    if ((await LM.availability()) !== 'available') return null;   // never start a big download from a game
    webSession?.destroy?.();
    return webSession = await LM.create({ initialPrompts: [{ role: 'system', content: rules }] });
  } catch { return null; }
}

let status = null, asking = null, lastAt = -1e9;
/** 'available' | 'downloadable' | 'downloading' | 'unavailable' (cached after the first check). */
export async function phoneAIStatus() {
  if (status) return status;
  try {
    if (plugin) status = (await plugin.modelAvailable()).status || 'unavailable';
    else status = typeof window !== 'undefined' && window.LanguageModel ? ((await window.LanguageModel.availability()) === 'available' ? 'available' : 'unavailable') : 'unavailable';
  } catch { status = 'unavailable'; }
  if (status !== 'available') setTimeout(() => { status = null; }, 60000);   // look again later (it may be downloading)
  return status;
}

export class PhoneAI {
  constructor({ persona = '', words = 30, temperature = .8, timeout = 4 } = {}) {
    this.rules = RULES(persona, Math.max(5, Math.min(60, words | 0)));
    this.words = Math.max(5, Math.min(60, words | 0)); this.temperature = temperature; this.timeout = timeout;
    this.kept = new Map(); this.available = null; this.last = null;
    this.ready();
  }
  /** Resolves to true when this phone has a built-in model ready to use. */
  async ready() { return this.available = (await phoneAIStatus()) === 'available'; }
  /**
   * Asks the model; resolves to its answer, tidied and checked, or `fallback` (when the phone has no
   * model, it's busy, too soon after the last ask, slow, or the answer didn't pass the guard rails).
   */
  async ask(prompt, { fallback = '', words = this.words, fresh = false } = {}) {
    prompt = String(prompt || '').slice(0, 600);
    if (!fresh && this.kept.has(prompt)) return this.kept.get(prompt);
    const now = performance.now();
    if (!prompt || asking || now - lastAt < 2000 || !(await this.ready())) return fallback;
    lastAt = now;
    const want = (async () => {
      if (plugin) return (await plugin.modelAsk({ prompt, instructions: this.rules, maxTokens: Math.round(words * 2.2), temperature: this.temperature })).text;
      const s = await web(this.rules); return s ? s.prompt(prompt) : null;
    })();
    asking = want;
    let text = null;
    try { text = await Promise.race([want, new Promise(r => setTimeout(() => r(null), this.timeout * 1000))]); } catch { text = null; }
    finally { asking = null; }
    const t = tidy(text, words);
    if (t) { this.kept.set(prompt, t); this.last = t; }
    return t || fallback;
  }
  /** Forgets the answers it kept (call in reset() for new lines each round). */
  forget() { this.kept.clear(); return this; }
}
