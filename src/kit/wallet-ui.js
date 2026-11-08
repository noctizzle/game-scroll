// Credits pill in the top bar, the trophies panel it opens, win/trophy toasts, and the
// per-game shop shown on a game's start and game-over screens.
import { progress, fairPrice } from './progress.js';
import { TROPHIES, checkTrophies } from './trophies.js';
import { services } from './services.js';
import { fmt } from '../util.js';
import { sfx } from '../sfx.js';

const esc = s => String(s).replace(/[&<>"']/g, c => `&#${c.charCodeAt(0)};`);
let GAMES = [];

export function initWallet(games) {
  GAMES = games;
  const panel = document.getElementById('wallet');
  // Every slide's rail has a credits button showing the balance; it opens the panel.
  progress.on(() => document.querySelectorAll('.walletbtn .n').forEach(n => { n.textContent = fmt(progress.credits); }));
  document.addEventListener('click', e => { if (e.target.closest('.walletbtn')) { renderPanel(); panel.showModal(); } });
  panel.addEventListener('click', e => { if (e.target === panel || e.target.closest('[data-close]')) panel.close(); });
  progress.on(() => { if (panel.open) renderPanel(); });
  services.on(() => { if (panel.open) renderPanel(); });
}

function renderPanel() {
  const panel = document.getElementById('wallet'), got = TROPHIES.filter(t => progress.hasTrophy(t.id)).length;
  const svc = !services.available
    ? `<p class="w-note">${esc(services.name)} sync turns on in the iOS and Android apps.</p>`
    : services.signedIn
      ? `<div class="w-svc"><button data-act="ach">Achievements</button><button data-act="lb">Leaderboards</button></div><p class="w-note">Signed in to ${esc(services.name)}${services.player ? ' as ' + esc(services.player) : ''}. Progress is saved to the cloud.</p>`
      : `<div class="w-svc"><button data-act="in">Sign in to ${esc(services.name)}</button></div><p class="w-note">Sign in to save progress to the cloud and earn ${esc(services.name)} achievements.</p>`;
  panel.innerHTML = `<div class="w-card">
    <button class="w-x" data-close aria-label="Close">✕</button>
    <div class="w-bal"><span>◆</span>${fmt(progress.credits)}<small>credits</small></div>
    <p class="w-note">Win any game to earn credits, then spend them on items in games with a shop.</p>
    <div class="w-stats"><div><b>${progress.totalWins()}</b>wins</div><div><b>${progress.gamesWon()}</b>/${GAMES.length} games won</div><div><b>${got}</b>/${TROPHIES.length} trophies</div></div>
    ${svc}
    <h3>Trophies</h3>
    <ul class="w-list">${TROPHIES.map(t => `<li class="${progress.hasTrophy(t.id) ? 'got' : ''}"><span class="w-ic">${progress.hasTrophy(t.id) ? '🏆' : '🔒'}</span><span><b>${esc(t.name)}</b>${esc(t.desc)}</span></li>`).join('')}</ul>
  </div>`;
  panel.querySelector('[data-act="ach"]')?.addEventListener('click', () => services.showAchievements());
  panel.querySelector('[data-act="lb"]')?.addEventListener('click', () => services.showLeaderboards());
  panel.querySelector('[data-act="in"]')?.addEventListener('click', () => services.signIn(GAMES));
}

/** Short message that floats over a slide's screen. */
export function toast(slideEl, text, kind = '') {
  const host = slideEl.querySelector('.screen'), el = document.createElement('div');
  const stack = host.querySelectorAll('.toast').length;
  el.className = 'toast ' + kind; el.textContent = text; el.style.setProperty('--i', stack);
  host.appendChild(el); setTimeout(() => el.remove(), 2200);
}

/** Shop chips for a game's overlay (empty when the game has no shop). */
export function shopHTML(def) {
  const items = (Array.isArray(def.shop) ? def.shop : []).filter(it => it && fairPrice(it.price));   // a bad price can't be bought, so isn't shown
  if (!items.length) return '';
  const chips = items.map(it => {
    const n = progress.owned(def.id, it), unlock = it.kind === 'unlock';
    const state = unlock ? (n > 0 ? 'Owned' : `◆${it.price}`) : (n > 0 ? `×${n} ready · ◆${it.price}` : `◆${it.price}`);
    const poor = !(unlock && n > 0) && progress.credits < it.price;
    return `<button class="chip${n > 0 ? ' owned' : ''}${poor ? ' poor' : ''}" data-item="${esc(it.id)}" title="${esc(it.desc)}"><b>${esc(it.name)}</b><span>${state}</span></button>`;
  }).join('');
  return `<div class="shop" aria-label="Shop"><div class="shop-k">Shop · you have ◆${fmt(progress.credits)} · boosts are used on your next run</div><div class="chips">${chips}</div></div>`;
}

export function bindShop(overlay, def, rerender) {
  overlay.querySelectorAll('.chip').forEach(b => b.addEventListener('click', e => {
    e.stopPropagation();                       // a tap on the shop must not start the game
    const it = def.shop.find(x => x.id === b.dataset.item);
    if (it.kind === 'unlock' && progress.owned(def.id, it) > 0) return;
    if (progress.buy(def.id, it)) {
      sfx(990, .08, 'triangle', .05, 300); rerender();
      const slide = overlay.closest('.slide');
      for (const t of checkTrophies()) { toast(slide, `🏆 ${t.name}`, 'trophy'); services.unlock(t.id); }
    }
    else { sfx(160, .12, 'square', .04); b.classList.remove('shake'); void b.offsetWidth; b.classList.add('shake'); }
  }));
}
