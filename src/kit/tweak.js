// Live sliders for tuning a game while you play it. In `npm run dev` a small panel (lil-gui) shows the
// values of the game on screen; drag a slider and the game uses the new number on its next frame.
// "Copy values" puts them on the clipboard to paste back into the file. In the store apps and the
// test builds there is no panel: gs.tweak just hands back the starting values, so the call can stay.
//
//   const T = gs.tweak('Car', {
//     speed: 3,                    // a number: a slider from 0 to 3x it
//     grip: [.8, 0, 1, .01],       // [value, min, max, step]
//     drift: true,                 // a tick box
//     paint: '#ff8800',            // a colour
//     mode: ['easy', 'easy', 'hard'], // [value, ...choices] for a list (strings)
//   });
//   update(dt) { car.x += T.speed * dt; }   // read T.x where it's used, so a slider change shows at once
//
// Call it in make() (or reset()). Values you changed survive hot reload; change the number in the
// file and the file's number wins again.

import { currentOwner, own } from './cleanup.js';

const DEV = !!(import.meta.env && import.meta.env.DEV);

const isRange = v => Array.isArray(v) && typeof v[0] === 'number';
const isList = v => Array.isArray(v) && typeof v[0] === 'string';
const startOf = v => (Array.isArray(v) ? v[0] : v);

// game id + folder -> { values, from: the file's starting values }: kept across hot reloads
const kept = new Map();
// card -> { gui, folders } and the card on screen
const panels = new Map();
let shown = null, lib = null;

/** Starting values from spec; in dev builds also a panel of sliders for them. */
export function tweak(name, spec) {
  if (typeof name !== 'string') { spec = name; name = 'Tweaks'; }
  spec = spec || {};
  const from = {}; for (const [k, v] of Object.entries(spec)) from[k] = startOf(v);
  if (!DEV) return { ...from };

  const card = currentOwner(), id = card?.def?.id || '?', key = id + '/' + name;
  let k = kept.get(key);
  if (!k) kept.set(key, k = { values: { ...from }, from: { ...from } });
  for (const [f, v] of Object.entries(from)) {   // the file changed this one (or it's new): the file wins
    if (!(f in k.values) || k.from[f] !== v) k.values[f] = v;
  }
  for (const f of Object.keys(k.values)) if (!(f in from)) delete k.values[f];
  k.from = { ...from };
  if (card) addFolder(card, name, spec, k.values);
  return k.values;
}

function addFolder(card, name, spec, values) {
  let p = panels.get(card);
  if (!p) {
    panels.set(card, p = { folders: [], gui: null, free() { p.gui?.destroy(); p.gui = null; panels.delete(card); } });
    own(p);
  }
  const old = p.folders.findIndex(f => f.name === name);
  if (old >= 0) p.folders.splice(old, 1);
  p.folders.push({ name, spec, values });
  if (p.gui) build(card, p); else if (shown === card) show(card);
}

async function build(card, p) {
  lib ||= import('lil-gui').then(m => m.default || m.GUI);
  const GUI = await lib;
  if (!panels.has(card)) return;
  p.gui?.destroy();
  const gui = p.gui = new GUI({ title: '🎚 ' + (card.def?.title || 'Tweaks'), width: 240 });
  gui.domElement.style.cssText += ';position:fixed;top:8px;right:8px;z-index:9999;max-height:80vh;overflow:auto';
  for (const { name, spec, values } of p.folders) {
    const f = p.folders.length > 1 ? gui.addFolder(name) : gui;
    for (const [k, v] of Object.entries(spec)) {
      if (typeof v === 'function') { f.add({ [k]: v }, k); continue; }
      if (isRange(v)) { f.add(values, k, v[1], v[2], v[3]); continue; }
      if (isList(v)) { f.add(values, k, v.slice(1)); continue; }
      if (typeof v === 'number') {
        const lo = v < 0 ? v * 3 : 0, hi = v > 0 ? v * 3 : v < 0 ? 0 : 1;
        f.add(values, k, lo, hi, Math.abs(hi - lo) / 300 || .01); continue;
      }
      if (typeof v === 'string' && /^#[0-9a-f]{3,8}$/i.test(v)) { f.addColor(values, k); continue; }
      f.add(values, k);
    }
  }
  gui.add({ 'Copy values': () => copy(p) }, 'Copy values');
  gui.domElement.style.display = shown === card ? '' : 'none';
}

function copy(p) {
  const text = p.folders.map(({ name, spec, values }) => `gs.tweak('${name}', {\n` + Object.entries(spec).map(([k, v]) => {
    const x = values[k];
    const val = isRange(v) ? `[${[+x.toFixed(4), ...v.slice(1)].join(', ')}]` : isList(v) ? JSON.stringify([x, ...v.slice(1)]) : typeof v === 'function' ? null : JSON.stringify(typeof x === 'number' ? +x.toFixed(4) : x);
    return val == null ? null : `  ${/^[a-z_$][\w$]*$/i.test(k) ? k : JSON.stringify(k)}: ${val},`;
  }).filter(Boolean).join('\n') + '\n});').join('\n');
  console.info(text);
  navigator.clipboard?.writeText(text).catch(() => {});
}

/** The app calls this when a card comes on screen: only its panel shows. */
export function show(card) {
  if (!DEV) return;
  shown = card;
  for (const [c, p] of panels) {
    if (c === card && !p.gui) build(c, p);
    if (p.gui) p.gui.domElement.style.display = c === card ? '' : 'none';
  }
}
