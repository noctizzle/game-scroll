// "My games": the games you hearted and the ones you Meh'd. Tap a row to play that game now,
// or un-heart / un-Meh it from here. Opened from the ♥ button in the top bar.
import { rating, setRating, stats } from './qa.js';
import { store, fmt } from './util.js';

const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/** opts: { games, best, play(id), changed(id, r), qa() } */
export function openMyGames({ games, best, play, changed, qa }, tab = 'liked') {
  const el = document.createElement('dialog'); el.className = 'qa-panel mine';
  document.body.appendChild(el);
  const render = () => {
    const liked = games.filter(g => rating(g.id) > 0), meh = games.filter(g => rating(g.id) < 0);
    const list = (tab === 'liked' ? liked : meh).sort((a, b) => stats(b.id).secs - stats(a.id).secs || a.title.localeCompare(b.title));
    el.innerHTML = `<div class="qa-head"><b>MY GAMES</b><span></span>${qa ? '<button class="qa-un mine-qa">QA report</button>' : ''}<button class="qa-x" aria-label="Close">✕</button></div>
      <div class="mine-tabs" role="tablist">
        <button role="tab" data-t="liked" aria-selected="${tab === 'liked'}">♥ Hearted · ${liked.length}</button>
        <button role="tab" data-t="meh" aria-selected="${tab === 'meh'}">👎 Meh · ${meh.length}</button>
      </div>
      ${list.length ? `<ul>${list.map(g => `<li data-id="${g.id}">
          <button class="mine-play" aria-label="Play ${esc(g.title)}"><span class="qa-t">${esc(g.title)}<small>${esc(g.tag)} · best ${fmt(best(g.id))}${stats(g.id).plays ? ` · ${stats(g.id).plays} plays` : ''}</small></span><span class="mine-go">▶</span></button>
          <button class="qa-un">${tab === 'liked' ? 'Un-heart' : 'Un-Meh'}</button></li>`).join('')}</ul>`
        : `<p class="qa-help">${tab === 'liked' ? 'Tap ♥ on a game in the feed and it shows up here.' : 'Games you Meh are hidden from your feed and listed here, so you can bring them back.'}</p>`}`;
    el.querySelector('.qa-x').onclick = () => el.close();
    el.querySelector('.mine-qa')?.addEventListener('click', () => { el.close(); qa(); });
    el.querySelectorAll('[role=tab]').forEach(b => b.onclick = () => { tab = b.dataset.t; render(); });
    el.querySelectorAll('.mine-play').forEach(b => b.onclick = () => { const id = b.closest('li').dataset.id; el.close(); play(id); });
    el.querySelectorAll('li .qa-un').forEach(b => b.onclick = () => {
      const id = b.closest('li').dataset.id; setRating(id, 0); store.set('gs_like_' + id, false); changed?.(id, 0); render();
    });
  };
  el.addEventListener('close', () => el.remove());
  render(); el.showModal();
}
