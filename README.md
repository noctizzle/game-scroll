# Game Scroll

A vertical feed of quick mini games: swipe up for the next one, tap to play. Built for iOS and Android with [Capacitor](https://capacitorjs.com), with every game written as a small HTML5 canvas module.

## Run it

```bash
npm install
npm run dev        # open the printed URL on your phone (same Wi-Fi) or in a desktop browser
```

Desktop keys: Space/Enter to start, arrows to steer, ↓ for the next game.

## Native apps

```bash
npx cap add ios        # first time only (needs a Mac with Xcode)
npx cap add android    # first time only (needs Android Studio)
npm run ios            # build, sync and open Xcode
npm run android        # build, sync and open Android Studio
```

## Adding a game

Every file in `src/games/` is one game and is picked up by the feed automatically. A game exports:

```js
export default {
  id: 'my-game', title: 'My Game', tag: 'Casual · Timing',
  retro: false,          // true = pocket handheld frame + 4-shade LCD palette
  pal: 'moss',           // retro only: a key from src/palettes.js
  w: 360, h: 640,        // logical canvas size (pocket games use 160x160)
  hint: 'One sentence on how to play.',
  make(api) {            // api.score(n), api.over()
    return { reset() {}, update(dt) {}, draw(ctx) {}, down(x, y) {}, move(x, y, pressed) {}, up(x, y) {}, key(k, isDown) {}, fx(dt) {} };
  },
};
```

`fx(dt)` is optional and keeps effects animating on the game-over screen.

## Phone features

`src/kit/device.js` gives games haptics, tilt, shake, compass heading, GPS location, the microphone and the camera. On web and desktop, or when the player refuses a permission, these calls do nothing or return `null`. That means every game needs a touch fallback (for example, drag instead of tilt). Call `want('motion')` in `make()` for tilt, shake or compass games: iOS asks for motion permission on the player's next tap. The usage strings for iOS and the permissions for Android are already set.

## Foldables

The app supports folding and unfolding mid-game (tested at Galaxy Z Fold 8 and iPhone Duo screen sizes). On wide screens, like the unfolded iPhone Duo or a tablet, the caption and buttons move to a side column. Android is configured not to restart on fold (`configChanges` and `resizeableActivity` in `AndroidManifest.xml`), and iOS allows every orientation. `npm run fold` simulates folding and unfolding during a game.

## Testing

`npm run smoke` builds the app and plays every game with random input on a phone-sized screen, failing if any game throws. Pass ids to test only some: `node scripts/smoke.cjs lane-racer worm`. Needs Playwright (`npm i -D playwright && npx playwright install chromium`).

## Roadmap

Launch target is **1000 unique games** (distinct mechanics, not reskins), built in batches. The idea list lives in `docs/game-ideas.md`.
