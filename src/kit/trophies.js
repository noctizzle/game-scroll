// Trophies (achievements) and leaderboards shared by every game.
//
// Game Center and Play Games both cap how many achievements and leaderboards one app can
// have, well below 1000, so trophies are about the whole feed (total wins, games won,
// credits) rather than one per game. Each has a stable `id`; the platform ids it maps to live
// in platform-ids.js. Add new trophies at the end and never rename an id once shipped.
import { progress as P } from './progress.js';

const T = (id, name, desc, points, test) => ({ id, name, desc, points, test });

export const TROPHIES = [
  T('first-win', 'First Win', 'Win any game.', 10, () => P.totalWins() >= 1),
  T('wins-10', 'On a Roll', 'Win 10 times.', 10, () => P.totalWins() >= 10),
  T('wins-50', 'Regular', 'Win 50 times.', 20, () => P.totalWins() >= 50),
  T('wins-250', 'Veteran', 'Win 250 times.', 40, () => P.totalWins() >= 250),
  T('wins-1000', 'Legend', 'Win 1,000 times.', 80, () => P.totalWins() >= 1000),

  T('won-5', 'Sampler', 'Win 5 different games.', 10, () => P.gamesWon() >= 5),
  T('won-25', 'All-Rounder', 'Win 25 different games.', 20, () => P.gamesWon() >= 25),
  T('won-100', 'Collector', 'Win 100 different games.', 40, () => P.gamesWon() >= 100),
  T('won-250', 'Completionist', 'Win 250 different games.', 60, () => P.gamesWon() >= 250),
  T('won-500', 'Half the Feed', 'Win 500 different games.', 80, () => P.gamesWon() >= 500),
  T('won-1000', 'Beat the Feed', 'Win 1,000 different games.', 100, () => P.gamesWon() >= 1000),

  T('played-10', 'Scroller', 'Play 10 different games.', 5, () => P.gamesPlayed() >= 10),
  T('played-100', 'Deep Scroller', 'Play 100 different games.', 20, () => P.gamesPlayed() >= 100),
  T('played-500', 'Doom Scroller', 'Play 500 different games.', 40, () => P.gamesPlayed() >= 500),

  T('credits-100', 'Pocket Money', 'Earn 100 credits.', 10, () => P.earnedTotal() >= 100),
  T('credits-1000', 'Savings', 'Earn 1,000 credits.', 20, () => P.earnedTotal() >= 1000),
  T('credits-10000', 'High Roller', 'Earn 10,000 credits.', 50, () => P.earnedTotal() >= 10000),
  T('first-buy', 'Shopper', 'Buy an item in any game.', 10, () => P.totalBought() >= 1),
  T('spent-500', 'Big Spender', 'Spend 500 credits.', 20, () => P.spentTotal() >= 500),
];

// Leaderboards: three for the whole feed, plus one for any game marked `board: true`
// (keep those few: the platforms cap the count).
export const BOARDS = [
  { id: 'total-wins', name: 'Total Wins', value: () => P.totalWins() },
  { id: 'games-won', name: 'Games Won', value: () => P.gamesWon() },
  { id: 'credits-earned', name: 'Credits Earned', value: () => P.earnedTotal() },
];
export const gameBoardId = gameId => 'best.' + gameId;

/** Grants any trophies whose condition is now met; returns the newly earned ones. */
export function checkTrophies() {
  const fresh = [];
  for (const t of TROPHIES) if (!P.hasTrophy(t.id) && t.test() && P.grant(t.id)) fresh.push(t);
  return fresh;
}
