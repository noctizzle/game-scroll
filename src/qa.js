// QA tools: rate games while scrolling, hide the ones you don't like, and see/copy a report.
//
// - Every slide gets a thumbs-down ("Meh") next to the heart. Meh hides that game from your
//   feed on this device and skips to the next one (with Undo).
// - Every finished round is logged (plays, total seconds, best), so the report shows which
//   games people actually stick with.
// - Tap the GAME SCROLL logo to open the QA panel: every game with your rating and play stats,
//   unhide buttons, and "Copy report" to paste into chat.
// - BENCHED games are hidden for everyone (still in the code, waiting for a fix or a delete).
import { store } from './util.js';

/** Hidden from the feed for everyone. Add an id here to pull a game without deleting its file. */
export const BENCHED = new Set([]);

const K = 'gs_qa';
let db = store.get(K, {});            // { [id]: { r: 1|-1|0, t: when r last changed, plays, secs } }
const save = () => store.set(K, db);
const row = id => (db[id] ||= { r: 0, t: 0, plays: 0, secs: 0 });

export const rating = id => db[id]?.r || 0;
export const stats = id => db[id] || { r: 0, t: 0, plays: 0, secs: 0 };
export function setRating(id, r) { const x = row(id); x.r = r; x.t = Date.now(); save(); }

/* ---------- sync without a server ----------
   ratingsSnapshot() is a small JSON-able object to put inside the player's cloud save
   (Game Center / Play Games saved games). mergeRatings() folds in a snapshot from another
   device: the newer rating per game wins, play counts take the max. Safe to call repeatedly. */
export const ratingsSnapshot = () => JSON.parse(JSON.stringify(db));
export function mergeRatings(other) {
  if (!other || typeof other !== 'object') return;
  for (const [id, o] of Object.entries(other)) {
    const x = row(id);
    if ((o.t || 0) > (x.t || 0)) { x.r = o.r || 0; x.t = o.t; }
    x.plays = Math.max(x.plays, o.plays || 0); x.secs = Math.max(x.secs, o.secs || 0);
  }
  save();
}
export const isHidden = id => BENCHED.has(id) || rating(id) === -1;
export function logRound(id, ms) { const x = row(id); x.plays++; x.secs = Math.round(x.secs + ms / 1000); save(); }

/* ---------- toast with undo ---------- */
let toastEl, toastT;
export function toast(msg, undo) {
  if (!toastEl) { toastEl = document.createElement('div'); toastEl.className = 'qa-toast'; toastEl.setAttribute('role', 'status'); document.body.appendChild(toastEl); }
  toastEl.innerHTML = `<span>${msg}</span>${undo ? '<button>Undo</button>' : ''}`;
  if (undo) toastEl.querySelector('button').onclick = () => { undo(); toastEl.classList.remove('on'); };
  toastEl.classList.add('on'); clearTimeout(toastT); toastT = setTimeout(() => toastEl.classList.remove('on'), 3500);
}

/* ---------- report ---------- */
export function report(games, best) {
  const line = g => { const x = db[g.id] || {}; return `${g.id} (${g.title})${x.plays ? ` · ${x.plays} plays, ${x.secs}s, best ${best(g.id)}` : ''}`; };
  const by = r => games.filter(g => rating(g.id) === r);
  const played = games.filter(g => !rating(g.id) && db[g.id]?.plays);
  return [
    `Game Scroll QA report · ${new Date().toISOString().slice(0, 10)} · ${games.length} games`,
    `\nMEH (${by(-1).length}):`, ...by(-1).map(line),
    `\nLIKED (${by(1).length}):`, ...by(1).map(line),
    `\nPLAYED, NOT RATED (${played.length}):`, ...played.sort((a, b) => db[b.id].secs - db[a.id].secs).map(line),
    `\nNOT PLAYED YET: ${games.filter(g => !db[g.id]?.plays && !rating(g.id)).length}`,
  ].join('\n');
}

/* ---------- panel ---------- */
export function openPanel(games, best, onChange) {
  const el = document.createElement('dialog'); el.className = 'qa-panel';
  const rated = games.filter(g => rating(g.id)).length, played = games.filter(g => db[g.id]?.plays).length;
  const rows = [...games].sort((a, b) => rating(a.id) - rating(b.id) || a.title.localeCompare(b.title)).map(g => {
    const x = db[g.id] || {}, r = rating(g.id);
    return `<li data-id="${g.id}"><span class="qa-r">${BENCHED.has(g.id) ? '⏸' : r > 0 ? '♥' : r < 0 ? '👎' : '·'}</span>
      <span class="qa-t">${g.title}<small>${x.plays ? `${x.plays} plays · ${x.secs}s · best ${best(g.id)}` : 'not played'}</small></span>
      ${r < 0 ? '<button class="qa-un">Unhide</button>' : ''}</li>`;
  }).join('');
  el.innerHTML = `<div class="qa-head"><b>QA</b><span>${played}/${games.length} played · ${rated} rated</span><button class="qa-x" aria-label="Close">✕</button></div>
    <p class="qa-help">👎 Meh on a game hides it from your feed. Copy the report and paste it into chat to flag games for removal.</p>
    <div class="qa-actions"><button class="qa-copy">Copy report</button></div>
    <ul>${rows}</ul>`;
  document.body.appendChild(el);
  el.querySelector('.qa-x').onclick = () => el.close();
  el.addEventListener('close', () => el.remove());
  el.querySelector('.qa-copy').onclick = async e => {
    const txt = report(games, best);
    try { await navigator.clipboard.writeText(txt); e.target.textContent = 'Copied ✓'; }
    catch { const t = document.createElement('textarea'); t.value = txt; t.rows = 10; e.target.replaceWith(t); t.select(); }
  };
  el.querySelectorAll('.qa-un').forEach(b => b.onclick = () => { const id = b.closest('li').dataset.id; setRating(id, 0); b.closest('li').querySelector('.qa-r').textContent = '·'; b.remove(); onChange?.(); });
  el.showModal();
}
