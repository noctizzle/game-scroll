// Settings sheet, opened from the ⚙ button in the top bar.
// How many streamed games are saved on this device (with a button to clear them), the licence, and credits.
import { fmt } from './util.js';
import { playstats } from './playstats.js';
import { HEARTS_URL } from './hearts.js';

const size = b => b < 1024 * 1024 ? `${Math.ceil(b / 1024)} KB` : `${(b / 1024 / 1024).toFixed(1)} MB`;

/** opts: { stream, cached(): {games, bytes, max}, clear(): Promise } */
export function openSettings({ stream, cached, clear }) {
  const el = document.createElement('dialog'); el.className = 'qa-panel settings';
  document.body.appendChild(el);
  const render = note => {
    const c = cached();
    el.innerHTML = `<div class="qa-head"><b>SETTINGS</b><span></span><button class="qa-x" aria-label="Close">✕</button></div>
      <section class="set-row">
        <h3>Game cache</h3>
        ${stream
          ? `<p class="qa-help">Games stream in as you scroll. The last ${c.max} you played are saved on this device so they open instantly and work offline.</p>
             <div class="set-stat"><b>${fmt(c.games)}</b> of ${c.max} games saved · ${size(c.bytes)}</div>
             <div class="qa-actions"><button class="set-clear"${c.games ? '' : ' disabled'}>Clear cache</button></div>`
          : `<p class="qa-help">This is a test build with every game built in, so there's nothing to cache.</p>`}
        ${note ? `<p class="set-note" role="status">${note}</p>` : ''}
      </section>
      ${HEARTS_URL ? `<section class="set-row">
        <h3>Play stats</h3>
        <p class="qa-help">Counts how often each game is played or skipped, added up across everyone. It helps pick which games to improve and which to show more. Nothing identifies you.</p>
        <label class="set-toggle"><input type="checkbox" class="set-stats"${playstats.enabled ? ' checked' : ''}> Share anonymous play stats</label>
      </section>` : ''}
      <section class="set-row">
        <h3>Licence</h3>
        <p class="qa-help">Copyright © 2026 Rob and Game Scroll contributors. The code is under the PolyForm Shield License 1.0.0: you can use, change and share it for anything except making a product that competes with Game Scroll.</p>
        <details class="set-lic"><summary>Open-source parts</summary>
          <dl>
            <dt>three.js</dt><dd>MIT</dd>
            <dt>Capacitor</dt><dd>MIT</dd>
            <dt>Press Start 2P font</dt><dd>SIL OFL 1.1</dd>
            <dt>Rubik font</dt><dd>SIL OFL 1.1</dd>
          </dl>
        </details>
        <p class="set-link"><a href="https://github.com/robthewizzuk/game-scroll/blob/main/LICENSE" target="_blank" rel="noopener">Read the full licence ↗</a></p>
      </section>
      <footer class="set-made">Made by <b>Rob</b></footer>`;
    el.querySelector('.qa-x').onclick = () => el.close();
    el.querySelector('.set-stats')?.addEventListener('change', e => { playstats.enabled = e.target.checked; });
    el.querySelector('.set-clear')?.addEventListener('click', async e => {
      e.target.disabled = true; await clear(); render('Cache cleared. Games will download again as you play them.');
    });
  };
  el.addEventListener('click', e => { if (e.target === el) el.close(); });
  el.addEventListener('close', () => el.remove());
  render(); el.showModal();
}
