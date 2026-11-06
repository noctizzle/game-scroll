// Maps our trophy and leaderboard ids to the ids each store uses.
//
// iOS: you choose the ids yourself when creating them in App Store Connect, so they are
// derived from ours: trophy "first-win" -> "gs.ach.first_win", board "total-wins" ->
// "gs.lb.total_wins". Use exactly these ids in App Store Connect (`npm run game-services`
// prints the full list).
//
// Android: Play Console generates the ids (they look like "CgkI1a2b3c4dEAIQAQ"). After
// creating each achievement and leaderboard there, paste its id below. Anything left
// unmapped is skipped on Android, so the app works before this is filled in.
export const ANDROID = {
  achievements: {
    // 'first-win': 'CgkI...',
  },
  leaderboards: {
    // 'total-wins': 'CgkI...',
  },
};

const snake = s => s.replace(/[^a-z0-9]+/gi, '_').toLowerCase();
export const iosAchievement = id => 'gs.ach.' + snake(id);
export const iosBoard = id => 'gs.lb.' + snake(id);

export function platformId(platform, kind, id) {
  if (platform === 'ios') return kind === 'achievement' ? iosAchievement(id) : iosBoard(id);
  if (platform === 'android') return (kind === 'achievement' ? ANDROID.achievements : ANDROID.leaderboards)[id] || null;
  return null;
}
