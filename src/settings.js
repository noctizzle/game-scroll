// Settings sheet, opened from the ⚙ button in the top bar.
// For now: how many streamed games are saved on this device, and a button to clear them.
import { fmt } from './util.js';

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
      </section>`;
    el.querySelector('.qa-x').onclick = () => el.close();
    el.querySelector('.set-clear')?.addEventListener('click', async e => {
      e.target.disabled = true; await clear(); render('Cache cleared. Games will download again as you play them.');
    });
  };
  el.addEventListener('click', e => { if (e.target === el) el.close(); });
  el.addEventListener('close', () => el.remove());
  render(); el.showModal();
}
