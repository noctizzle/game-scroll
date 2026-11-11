// Full screen for Next Gen games: the ⛶ button on the console bezel hides the bezel, caption,
// buttons and top bar, so the game fills the display (the phone's own status and navigation bars are
// hidden all the time in the apps, see below). Ways out: the ✕ pill (shown on entry and when you swipe down from the top edge), the
// Android back gesture, "Exit full screen" in the pause menu, and the end of the round.
// The game itself only sees a bigger size through resize(w, h), so it is the same on WebGL and WebGPU.
import { Capacitor, SystemBars } from '@capacitor/core';
import { App } from '@capacitor/app';

const native = Capacitor.isNativePlatform();
let cur = null, changed = () => {};

// Next Gen only (AR games use the camera view and keep their frame).
export const canFull = def => def.era === 'nextgen';
export const isFull = s => !!s && cur === s;
export const anyFull = () => !!cur;
// main.js passes a refit callback, called after every enter / leave once the layout has changed.
export function onFullChange(fn) { changed = fn; }

export function enterFull(s) {
  if (cur === s) return;
  if (cur) leaveFull();
  cur = s;
  document.body.classList.add('fullscreen');
  s.el.classList.add('full');
  bars(true);
  pill(2500);
  changed(s, true);
}

export function leaveFull() {
  const s = cur;
  if (!s) return;
  cur = null;
  document.body.classList.remove('fullscreen');
  s.el.classList.remove('full');
  hidePill();
  bars(false);
  changed(s, false);
}

export const toggleFull = s => (isFull(s) ? leaveFull() : enterFull(s));

// System bars: in the apps they are hidden all the time (Rob's call, for the extra screen space), using
// Capacitor's built-in SystemBars plugin: Android hides status + navigation (a swipe from the edge shows
// them for a moment), iOS hides the status bar and home indicator. So full screen only removes our own
// frame there. On the web preview, full screen uses the browser's Fullscreen API where there is one.
function hideSystemBars() { if (native) SystemBars.hide().catch(() => {}); }
hideSystemBars();
function bars(hide) {
  if (native) return;
  try {
    const d = document;
    if (hide && !d.fullscreenElement) d.documentElement.requestFullscreen?.({ navigationUI: 'hide' })?.catch?.(() => {});
    else if (!hide && d.fullscreenElement) d.exitFullscreen?.()?.catch?.(() => {});
  } catch (_) {}
}
// Browser left full screen by itself (Esc on desktop, a system gesture): leave ours too.
document.addEventListener('fullscreenchange', () => { if (!native && !document.fullscreenElement && cur) leaveFull(); });
// Coming back to the app (or from a dialog, the share sheet...) can bring the bars back: hide them again.
document.addEventListener('visibilitychange', () => { if (!document.hidden) hideSystemBars(); });
addEventListener('focus', hideSystemBars);
// Back-up for bars that come back after a swipe from the edge and stay (on some phones): hide them
// again 3 seconds after the last touch. The system's own edge swipe often never reaches the page,
// so this listens to every touch, not only touches near an edge.
if (native) {
  let edgeT = 0;
  addEventListener('pointerdown', () => {
    clearTimeout(edgeT);
    edgeT = setTimeout(hideSystemBars, 3000);
  }, { capture: true, passive: true });
}

// Android back: leave full screen first. With a listener Capacitor no longer does its own back,
// so do what it did before (go back in the web view, otherwise close the app).
if (native && Capacitor.getPlatform() === 'android') {
  App.addListener('backButton', e => {
    if (cur) leaveFull();
    else if (e.canGoBack) history.back();
    else App.exitApp();
  });
}

// The ✕ pill at the top: shows for a moment on entry, and when a finger swipes down from the top edge.
let pillEl = null, pillT = 0;
function pill(ms) {
  if (!pillEl) {
    pillEl = document.createElement('button');
    pillEl.className = 'fs-pill';
    pillEl.type = 'button';
    pillEl.innerHTML = '<span aria-hidden="true">✕</span> Exit full screen';
    pillEl.addEventListener('pointerdown', e => e.stopPropagation());
    pillEl.onclick = e => { e.stopPropagation(); leaveFull(); };
    document.body.appendChild(pillEl);
  }
  pillEl.classList.add('show');
  clearTimeout(pillT);
  pillT = setTimeout(hidePill, ms);
}
function hidePill() { clearTimeout(pillT); pillEl?.classList.remove('show'); }
{
  let edge = null;
  addEventListener('pointerdown', e => { edge = cur && e.clientY < 32 ? { id: e.pointerId, y: e.clientY } : null; }, { capture: true, passive: true });
  addEventListener('pointermove', e => {
    if (!edge || e.pointerId !== edge.id) return;
    if (e.clientY - edge.y > 36) { edge = null; pill(3000); }
  }, { capture: true, passive: true });
  addEventListener('pointerup', () => { edge = null; }, { capture: true, passive: true });
}
