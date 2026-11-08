// Big libraries (physics engines, face tracking, 3D effects) load the first time a game needs them,
// not when the app starts. Kit code uses lazy() for each one:
//
//   const rapier = lazy('physics', () => import('@dimforge/rapier2d-compat').then(...));
//   rapier.get()    // the library, or throws StillLoading if it isn't in yet
//
// A game makes these things in make() or reset(). If the library isn't loaded yet, the error
// carries e.kitLoading (a promise): the app shows "Loading…", waits, and makes the game again.
// Not for games to import: they get everything through gamescroll.js.

export class StillLoading extends Error {
  constructor(name, promise) { super(`${name} is still loading`); this.name = 'StillLoading'; this.kitLoading = promise; }
}

export function lazy(name, loader) {
  let value, promise = null, failed = null;
  const load = () => promise ||= Promise.resolve().then(loader).then(v => (value = v), e => { failed = e; promise = null; throw e; });
  return {
    name,
    load,
    get ready() { return value !== undefined; },
    get() {
      if (value !== undefined) return value;
      if (failed && !promise) { const e = failed; failed = null; throw e; }
      throw new StillLoading(name, load());
    },
  };
}
