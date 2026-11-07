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

### Android APK from GitHub

Every push to `main` builds a debug APK (`.github/workflows/android-apk.yml`) and publishes it as the "Latest Android build" release. On the phone, signed in to GitHub in the browser, open https://github.com/robthewizzuk/game-scroll/releases/latest and tap `game-scroll.apk`. Builds share one debug key (`android/app/debug.keystore`), so each new APK installs over the old one and keeps progress. To build without pushing, run the workflow by hand from the Actions tab.

### iPhone .ipa from GitHub

There is no paid Apple Developer account yet, so the `iOS IPA (unsigned)` workflow (`.github/workflows/ios-ipa.yml`) builds an unsigned `.ipa` that testers sideload with Sideloadly and a free Apple ID (reinstall every 7 days). Run it by hand from the Actions tab; it publishes to the "Latest iOS build" release. Install steps: [docs/ios-sideload.md](docs/ios-sideload.md).

### Web version on GitHub Pages

Every push to `main` also builds the web app and publishes it to https://robthewizzuk.github.io/game-scroll/ (`.github/workflows/web-pages.yml`). One-time setup: Settings > Pages > Source: **GitHub Actions**. GitHub only serves Pages from a private repo on a paid plan (Pro); on the free plan the repo has to be public. Phone sensors that need a native plugin fall back to touch controls in the browser.

## Adding a game

Every file in `src/games/` is one game and is picked up by the feed automatically. A game exports:

```js
export default {
  id: 'my-game', title: 'My Game', tag: 'Casual · Timing',
  retro: false,          // true = pocket handheld frame + 4-shade LCD palette
  pal: 'moss',           // retro only: a key from src/palettes.js
  w: 360, h: 640,        // logical canvas size (pocket games use 160x160)
  hint: 'One sentence on how to play.',
  goal: 30,              // score that counts as a win and pays credits (required)
  make(api) {            // api.score(n), api.over()
    return { reset() {}, update(dt) {}, draw(ctx) {}, down(x, y) {}, move(x, y, pressed) {}, up(x, y) {}, key(k, isDown) {}, fx(dt) {} };
  },
};
```

`fx(dt)` is optional and keeps effects animating on the game-over screen.

## Phone features

`src/kit/device.js` gives games haptics (including short/long `buzz()` patterns), tilt, shake, face-down detection (`faceDown()`), compass heading, GPS location, the microphone and the camera. On web and desktop, or when the player refuses a permission, these calls do nothing or return `null`. That means every game needs a touch fallback (for example, drag instead of tilt). Call `want('motion')` in `make()` for tilt, shake or compass games: iOS asks for motion permission on the player's next tap. The usage strings for iOS and the permissions for Android are already set.

## Credits, trophies and cloud saves

Winning any game pays credits, which some games let you spend on items. Trophies, leaderboards and cloud saves go through Game Center on iOS and Play Games on Android. See [docs/game-services.md](docs/game-services.md) for the game fields (`goal`, `reward`, `shop`, `board`), the `api.win()` / `api.has()` hooks, and the store setup steps.

## Foldables

The app supports folding and unfolding mid-game (tested at Galaxy Z Fold 8 and iPhone Duo screen sizes). On wide screens, like the unfolded iPhone Duo or a tablet, the caption and buttons move to a side column. Android is configured not to restart on fold (`configChanges` and `resizeableActivity` in `AndroidManifest.xml`), and iOS allows every orientation. `npm run fold` simulates folding and unfolding during a game.

## Testing

`npm run smoke` builds the app and plays every game with random input on a phone-sized screen, failing if any game throws. Pass ids to test only some: `node scripts/smoke.cjs lane-racer worm`. Needs Playwright (`npm i -D playwright && npx playwright install chromium`).

## QA: finding and removing weak games

- **In the app**: every game has a 👎 *Meh* button next to the heart. Meh hides that game from your feed on that phone (with Undo). Tap the **GAME SCROLL** logo (or QA report in My games) to open the QA panel: every game with your rating, plays and time spent, Unhide buttons, and **Copy report** to paste into chat.
- **My games** (♥ button in the top bar): your hearted and Meh'd games. Tap one to play it next, or un-heart / un-Meh it.
- **Bench a game for everyone** without deleting it: add its id to `BENCHED` in `src/qa.js`.
- **Bot play test**: `npm run qa` plays every game with an idle bot and a random-tap bot and writes `docs/qa/auto-report.md` (errors, how fast rounds end, games that score with no input).
- **Scored review**: `docs/qa/review.md` scores every game on fun, clarity, controls, length and uniqueness, weakest first.
- **More like this**: hearts, Meh and time played shape the feed on the device (`src/recommend.js`). Each game's traits come from its tag and hint (genre, controls, sensor, pocket/casual); a game can add its own with `traits: ['theme:space']`. Every game still shows once per cycle.
- **Sync with no server**: `ratingsSnapshot()` / `mergeRatings()` in `src/qa.js` are meant to ride inside the Game Center / Play Games cloud save.
- **Removing a game**: delete its file in `src/games/` and untick it in `docs/game-ideas.md`.

## Roadmap

Launch target is **1000 unique games** (distinct mechanics, not reskins), built in batches of about eight. There are 132 so far. Games can be fluid: set `maxW`/`maxH` (and optional `step`) and implement `resize(w, h)` to receive the extra space on tall or unfolded screens. The idea list lives in `docs/game-ideas.md`, with built games ticked.

## License

Copyright © 2026 Rob ([@robthewizzuk](https://github.com/robthewizzuk)). All rights reserved. The code is public to view only; copying, modifying, redistributing or publishing it is not allowed. See [LICENSE](LICENSE).
