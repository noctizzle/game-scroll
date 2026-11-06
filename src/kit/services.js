// Bridge to Apple Game Center (iOS) and Google Play Games Services (Android) through the
// local GameServices Capacitor plugin in plugins/game-services. On the web, or before the
// store accounts are set up, every call quietly does nothing and progress stays local.
import { Capacitor, registerPlugin } from '@capacitor/core';
import { progress } from './progress.js';
import { TROPHIES, BOARDS, gameBoardId } from './trophies.js';
import { platformId } from './platform-ids.js';

const platform = Capacitor.getPlatform();               // 'ios' | 'android' | 'web'
const native = Capacitor.isNativePlatform() && Capacitor.isPluginAvailable('GameServices');
const GS = native ? registerPlugin('GameServices') : null;
const SAVE_NAME = 'progress';

let signedIn = false, player = null, saveTimer = 0, started = false;
const subs = new Set();
const tell = () => subs.forEach(f => f(services));
const quiet = p => p.catch(e => { console.warn('[game-services]', e?.message || e); return null; });

async function unlockRemote(trophyId) {
  const id = signedIn && platformId(platform, 'achievement', trophyId);
  if (id) await quiet(GS.unlockAchievement({ id }));
}
async function submitRemote(boardId, score) {
  const id = signedIn && platformId(platform, 'leaderboard', boardId);
  if (id && score > 0) await quiet(GS.submitScore({ leaderboardId: id, score: Math.floor(score) }));
}

/** Pushes everything we know (trophies, board values, the save) after signing in. */
async function fullSync(games) {
  const remote = await quiet(GS.loadGame({ name: SAVE_NAME }));
  // When two devices saved at once the platform hands back every copy; merging them all is safe.
  for (const text of remote?.all?.length ? remote.all : remote?.data ? [remote.data] : []) {
    try { progress.merge(JSON.parse(text)); } catch { /* corrupt copy: skip it */ }
  }
  for (const t of TROPHIES) if (progress.hasTrophy(t.id)) await unlockRemote(t.id);
  for (const b of BOARDS) await submitRemote(b.id, b.value());
  for (const g of games) if (g.board) await submitRemote(gameBoardId(g.id), progress.best(g.id));
  await saveNow();
}

async function saveNow() {
  clearTimeout(saveTimer); saveTimer = 0;
  if (!signedIn) return;
  await quiet(GS.saveGame({
    name: SAVE_NAME, data: progress.serialize(),
    description: `${progress.credits} credits · ${progress.gamesWon()} games won`,
  }));
}

export const services = {
  platform,
  get available() { return native; },
  get signedIn() { return signedIn; },
  get player() { return player; },
  /** Display name of the store's game service, for buttons. */
  get name() { return platform === 'ios' ? 'Game Center' : platform === 'android' ? 'Play Games' : 'Game services'; },
  on(f) { subs.add(f); return () => subs.delete(f); },

  /** Signs in (silently where the platform allows) and syncs. Safe to call more than once. */
  async init(games) {
    if (!native || started) return;
    started = true;
    const r = await quiet(GS.signIn());
    signedIn = !!r?.signedIn; player = r?.playerName || null; tell();
    if (signedIn) await fullSync(games);
    // Save to the cloud a few seconds after progress settles, so a run of changes is one write.
    progress.on(() => { if (signedIn && !saveTimer) saveTimer = setTimeout(saveNow, 4000); });
    document.addEventListener('visibilitychange', () => { if (document.hidden && saveTimer) saveNow(); });
  },
  unlock: unlockRemote,
  /** Reports a finished run: feed-wide boards always, the game's own board if it has one. */
  async reportRun(def) {
    if (!signedIn) return;
    for (const b of BOARDS) await submitRemote(b.id, b.value());
    if (def.board) await submitRemote(gameBoardId(def.id), progress.best(def.id));
  },
  showAchievements() { return signedIn ? quiet(GS.showAchievements()) : null; },
  showLeaderboards() { return signedIn ? quiet(GS.showLeaderboards()) : null; },
  async signIn(games) { if (!native) return; const r = await quiet(GS.signIn({ interactive: true })); signedIn = !!r?.signedIn; player = r?.playerName || null; tell(); if (signedIn) await fullSync(games); },
};
