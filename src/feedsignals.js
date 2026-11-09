// The live signals the For you ranking (recommend.js) reads: your ratings and play time, your
// history on this phone, everyone's anonymous stats and shared hearts, and the feed brain
// (feedbrain.js) that learns from each view here on the phone.
import { rating, stats } from './qa.js';
import { playstats } from './playstats.js';
import { hearts } from './hearts.js';
import { history } from './history.js';
import { store } from './util.js';
import { FeedBrain } from './feedbrain.js';

const KEY = 'gs_feedbrain';
export const feedBrain = new FeedBrain(store.get(KEY, null));
let saveT = 0;
// learns before the queue is re-ranked (main.js listens after this module has loaded)
history.onChange((id, w) => {
  if (feedBrain.outcome(id, w)) { clearTimeout(saveT); saveT = setTimeout(() => store.set(KEY, feedBrain.pack()), 1500); }
});
/** Settings › Reset recommendations: the feed brain and your play history start again. */
export function resetRecommendations() { feedBrain.reset(); store.set(KEY, null); history.forget(); }

export const live = {
  rating, mine: stats, seen: id => history.get(id), session: () => history.session(),
  global: id => playstats.global(id), hearts: id => (hearts.enabled ? hearts.count(id, false) : 0),
  now: () => Date.now(), brain: feedBrain,
};
