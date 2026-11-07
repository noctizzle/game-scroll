// The "Every game in the feed" list on the landing page: reads /games.json (made by
// scripts/build-site.mjs from src/games), with a style filter and a search box.
(async () => {
  const list = document.getElementById('list'), more = document.getElementById('more');
  const q = document.getElementById('q'), filters = document.getElementById('filters');
  const STYLES = [['all', 'All'], ['casual', 'Casual'], ['pocket', 'Pocket'], ['color', 'Color'], ['advance', 'Advance'], ['console', 'Classic Console'], ['nextgen', 'Next Gen']];
  const PAGE = 24;
  let games = [], style = 'all', shown = PAGE;
  try { games = (await (await fetch('/games.json')).json()).games; } catch { list.innerHTML = '<li>Couldn\'t load the games list.</li>'; return; }

  for (const [k, label] of STYLES) {
    const b = document.createElement('button');
    b.type = 'button'; b.textContent = label; b.setAttribute('aria-pressed', k === style);
    b.onclick = () => { style = k; shown = PAGE; for (const x of filters.children) x.setAttribute('aria-pressed', x === b); render(); };
    filters.append(b);
  }
  q.addEventListener('input', () => { shown = PAGE; render(); });
  more.onclick = () => { shown += PAGE * 2; render(); };

  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => `&#${c.charCodeAt(0)};`);
  function render() {
    const words = q.value.toLowerCase().split(/\s+/).filter(Boolean);
    const hits = games.filter(g => (style === 'all' || g.style === style) &&
      words.every(w => (g.title + ' ' + g.tag + ' ' + g.hint).toLowerCase().includes(w)));
    list.innerHTML = hits.slice(0, shown).map(g => `<li><span class="chip s-${g.style}">${esc(g.tag)}</span><h3>${esc(g.title)}</h3><p>${esc(g.hint)}</p>${g.by ? `<div class="by">Made by ${esc(g.by)}</div>` : ''}</li>`).join('')
      || '<li>No games match that yet. Maybe you could <a href="/make/">make one</a>?</li>';
    more.hidden = hits.length <= shown;
  }
  render();
})();
