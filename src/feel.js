// Sound & haptics sheet, opened from the 🔊 button in the top bar (and from Settings).
// Sound: on/off, volume, music on/off. Haptics: on/off and strength. Saved on this device.
import { sound, setSound, sfx } from './sfx.js';
import { hapticSettings, setHaptics, haptic, canBuzz } from './kit/device.js';
import { stopMusic } from './kit/sound.js';

const STRENGTH = [['light', 'Light'], ['normal', 'Normal'], ['strong', 'Strong']];

/** The top-bar icon for the current settings. */
export const feelIcon = () => sound.muted || !sound.volume ? '🔇' : sound.volume < .5 ? '🔉' : '🔊';

/** The sound and haptics controls as HTML (two set-row sections), for a sheet or the Settings list. */
export function feelHTML() {
  const vol = Math.round(sound.volume * 100), soundOff = sound.muted, hapOff = !hapticSettings.on;
  const vibe = canBuzz() || hapOff;
  return `<section class="set-row">
      <h3>Sound</h3>
      <label class="set-toggle"><input type="checkbox" class="feel-sound"${soundOff ? '' : ' checked'}> Sound</label>
      <label class="set-slider${soundOff ? ' off' : ''}"><span>Volume</span><input type="range" class="feel-vol" min="0" max="100" step="5" value="${vol}" aria-label="Volume"${soundOff ? ' disabled' : ''}><output>${vol}%</output></label>
      <label class="set-toggle${soundOff ? ' off' : ''}"><input type="checkbox" class="feel-music"${sound.music ? ' checked' : ''}${soundOff ? ' disabled' : ''}> Music in games</label>
    </section>
    <section class="set-row">
      <h3>Haptics</h3>
      ${vibe ? '' : '<p class="qa-help">This device can\'t vibrate, so these only apply on a phone.</p>'}
      <label class="set-toggle"><input type="checkbox" class="feel-hap"${hapOff ? '' : ' checked'}> Vibration</label>
      <div class="qa-actions set-fps feel-str${hapOff ? ' off' : ''}" role="group" aria-label="Vibration strength">${STRENGTH.map(([v, n]) => `<button data-str="${v}" aria-pressed="${hapticSettings.strength === v}"${hapticSettings.strength === v ? ' class="on"' : ''}${hapOff ? ' disabled' : ''}>${n}</button>`).join('')}</div>
      <p class="qa-help">Games that are played by feel (like Buzz Code) switch to on-screen flashes when vibration is off.</p>
    </section>`;
}

/** Wire up the controls feelHTML() made inside `root`. render() redraws them; changed() updates the top-bar icon. */
export function bindFeel(root, { render, changed }) {
  const q = s => root.querySelector(s);
  q('.feel-sound').addEventListener('change', e => {
    setSound({ muted: !e.target.checked });
    if (sound.muted) stopMusic(); else sfx(660, .08, 'triangle', .06, 220);
    changed(); render();
  });
  const vol = q('.feel-vol'), out = vol.nextElementSibling;
  vol.addEventListener('input', () => { setSound({ volume: vol.value / 100 }); out.textContent = vol.value + '%'; changed(); });
  vol.addEventListener('change', () => sfx(660, .08, 'triangle', .06, 220));    // a sample beep at the new volume
  q('.feel-music').addEventListener('change', e => { setSound({ music: e.target.checked }); });
  q('.feel-hap').addEventListener('change', e => { setHaptics({ on: e.target.checked }); haptic('medium'); render(); });
  root.querySelectorAll('.feel-str button').forEach(b => b.addEventListener('click', () => {
    setHaptics({ strength: b.dataset.str }); haptic('medium'); render();
  }));
}

/** Open the Sound & haptics sheet on its own. changed() runs after any change (to repaint the icon). */
export function openFeel({ changed = () => {} } = {}) {
  const el = document.createElement('dialog'); el.className = 'qa-panel settings feel';
  el.setAttribute('aria-label', 'Sound and haptics');
  document.body.appendChild(el);
  const render = () => {
    el.innerHTML = `<div class="qa-head"><b>SOUND &amp; HAPTICS</b><span></span><button class="qa-x" aria-label="Close">✕</button></div>${feelHTML()}`;
    el.querySelector('.qa-x').onclick = () => el.close();
    bindFeel(el, { render, changed });
  };
  el.addEventListener('click', e => { if (e.target === el) el.close(); });
  el.addEventListener('close', () => el.remove());
  render(); el.showModal();
}
