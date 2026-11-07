// The live signals the For you ranking (recommend.js) reads: your ratings and play time, your
// history on this phone, and everyone's anonymous stats and shared hearts.
import { rating, stats } from './qa.js';
import { playstats } from './playstats.js';
import { hearts } from './hearts.js';
import { history } from './history.js';

export const live = {
  rating, mine: stats, seen: id => history.get(id), session: () => history.session(),
  global: id => playstats.global(id), hearts: id => (hearts.enabled ? hearts.count(id, false) : 0),
  now: () => Date.now(),
};
