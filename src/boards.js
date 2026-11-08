// Leaderboards for every game, all time and today, kept by the API (workers/hearts/src/scores.js).
// No accounts or typed names: each install shows up under a made-up name ("Brave Otter 42") worked
// out from its anonymous device id. Games don't do anything: the app sends the score when a round
// ends and shows the player's place on the game-over screen, with the top 10 a tap away.
// With no API (dev and test builds) nothing is sent and nothing shows.
import { HEARTS_URL, deviceId, apiPost } from './hearts.js';
import { store } from './util.js';
import { fmt } from './util.js';

const DAY_KEY = 'gs_board_day';
const today = () => Math.floor(Date.now() / 86400000);
const ranks = new Map();   // game id -> last { all, day } from the server (this session)

export const boards = {
  enabled: !!HEARTS_URL,
  /**
   * Sends a finished round's score when it beats today's best here, with how long the round took
   * (the server's quick fairness checks use it). Resolves to { all, day } ranks, or null.
   */
  async submit(id, score, secs) {
    if (!this.enabled || !(score > 0)) return null;
    let d = store.get(DAY_KEY, null);
    if (!d || d.day !== today()) d = { day: today(), best: {} };
    if (score < (d.best[id] || 0)) return ranks.get(id) || null;   // not a new best today: show the last ranks
    try {
      const r = await apiPost('/score', { device: deviceId(), game: id, score: Math.floor(score), secs: Math.round(Math.max(0, secs || 0) * 10) / 10 });
      if (!r.ok) return null;   // 422: the quick checks didn't count it (nothing to show)
      const res = await r.json();
      d.best[id] = Math.max(d.best[id] || 0, score); store.set(DAY_KEY, d);
      ranks.set(id, res); return res;
    } catch (_) { return null; }   // offline
  },
  /** The top 10 and this player's place: when 'day' or 'all'. */
  async top(id, when = 'day') {
    const r = await fetch(`${HEARTS_URL}/board?game=${encodeURIComponent(id)}&device=${encodeURIComponent(deviceId())}&when=${when}`);
    if (!r.ok) throw new Error('board ' + r.status);
    return r.json();
  },
};

const esc = s => String(s).replace(/[&<>"']/g, c => '&#' + c.charCodeAt(0) + ';');

/** The line on the game-over screen: "🏆 #3 today · #12 of 340 all time". */
export function rankHTML(r) {
  if (!r?.day || !r?.all) return '';
  return `<button class="ov-rank">🏆 <b>#${fmt(r.day.rank)}</b> today · #${fmt(r.all.rank)} of ${fmt(r.all.of)} all time</button>`;
}

/** The leaderboard sheet for a game. */
export function openBoard(def, { onClose } = {}) {
  const dlg = document.createElement('dialog'); dlg.className = 'qa-panel board'; document.body.appendChild(dlg);
  let when = 'day';
  const render = (data, err) => {
    const rows = data ? data.top.map((t, i) => `<li class="${t.me ? 'me' : ''}"><span>#${i + 1}</span><span>${t.me ? 'You' : esc(t.name)}</span><b>${fmt(t.score)}</b></li>`).join('') : '';
    const me = data?.me && !data.top.some(t => t.me) ? `<li class="me gap"><span>#${fmt(data.me.rank)}</span><span>You</span><b>${fmt(data.me.score)}</b></li>` : '';
    dlg.innerHTML = `<div class="qa-head"><b>LEADERBOARD</b><span>${esc(def.title)}</span><button class="qa-x" aria-label="Close">✕</button></div>
      <div class="qa-actions set-fps board-tabs">${[['day', 'Today'], ['all', 'All time']].map(([k, n]) => `<button data-w="${k}" aria-pressed="${when === k}"${when === k ? ' class="on"' : ''}>${n}</button>`).join('')}</div>
      ${err ? `<p class="qa-help">${err}</p>` : !data ? '<p class="qa-help">Loading…</p>' : data.top.length ? `<ol class="board-list">${rows}${me}</ol><p class="qa-help">${fmt(data.of)} ${data.of === 1 ? 'player' : 'players'}${when === 'day' ? ' today' : ''}. ${data.me ? `You're ${esc(data.me.name)}.` : ''}</p>` : '<p class="qa-help">No scores yet. Be the first!</p>'}`;
    dlg.querySelector('.qa-x').onclick = () => dlg.close();
    dlg.querySelectorAll('.board-tabs button').forEach(b => b.onclick = () => { when = b.dataset.w; load(); });
  };
  const load = () => { render(null); boards.top(def.id, when).then(d => render(d), () => render(null, 'Couldn\'t load the leaderboard. Check your connection and try again.')); };
  dlg.addEventListener('click', e => { if (e.target === dlg) dlg.close(); });
  dlg.addEventListener('close', () => { dlg.remove(); onClose?.(); });
  load(); dlg.showModal();
}
