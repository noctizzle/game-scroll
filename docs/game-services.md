# Credits, trophies and cloud saves

## How it works

- **Credits.** Every game has a `goal` score. Reaching it in a run is a win: the run pays the game's `reward` (10 credits by default) and the game keeps going. The first win of each game pays double. The balance shows on every game's side rail (◆); tapping it opens the credits and trophies panel.
- **Shop.** A game can sell items for credits on its start and game-over screens. A `boost` is used up on the next run (e.g. Cave Flyer's Shield); an `unlock` is kept forever (e.g. Stack Up's Gold Blocks).
- **Trophies.** 19 feed-wide trophies (wins, different games won, games played, credits earned and spent) in `src/kit/trophies.js`. They are not one per game because Game Center and Play Games both cap achievements per app far below 1000.
- **Leaderboards.** Total Wins, Games Won and Credits Earned, plus a best-score board for any game marked `board: true` (Cave Flyer and Stack Up for now). Keep those few.
- **Saves.** Progress is saved on the device at every change, and to Game Center (iOS) or Play Games (Android) a few seconds later when signed in. Saves from two devices merge without losing credits or wins: each device keeps its own counters and the totals add up (`src/kit/progress.js`).
- **Other data in the save.** Other modules can add their own data to the cloud save with `progress.section(key, { snapshot, merge })` (game hearts and ratings use this).
- Until the store accounts are set up, or on the web, everything works locally and the sync is skipped.

## Adding these to a game

```js
export default {
  id: 'my-game', title: 'My Game', /* ... */
  goal: 30,              // required: score that counts as a win (npm run smoke fails without it)
  reward: 10,            // optional: credits per win (first win pays double)
  board: true,           // optional: give this game its own leaderboard (use sparingly)
  shop: [                // optional
    { id: 'shield', name: 'Shield', price: 25, kind: 'boost', desc: 'Survive one crash.' },
    { id: 'gold', name: 'Gold Skin', price: 150, kind: 'unlock', desc: 'Forever gold.' },
  ],
  make(api) {
    // api.score(n), api.over() as before
    // api.win()      : win right now (for games with a natural end, like clearing the board)
    // api.has('id')  : is this shop item active for the current run? Safe to call in reset().
  },
};
```

`npm run wallet` tests credits, the shop, trophies and save merging in a browser.

## What Rob needs to set up

The native code is in `plugins/game-services` (a local Capacitor plugin, picked up by `npx cap sync`). It has not been built on a device yet; expect the first Xcode and Android Studio build to need small fixes.

### iOS (Game Center)

1. In Xcode, open the App target > Signing & Capabilities and add **Game Center**, then **iCloud** with **iCloud Documents** ticked (Game Center saved games are stored in iCloud).
2. In App Store Connect, open the app > Services > Game Center, and turn Game Center on for the app version.
3. Create each achievement and leaderboard with the exact iOS ids from `npm run game-services` (for example `gs.ach.first_win`, `gs.lb.total_wins`). Leaderboards are "Classic", "High to low", integer, best score. Achievements need a 512×512 or 1024×1024 image each.
4. Test on a device with a sandbox Game Center account (Settings > Game Center).

### Android (Play Games Services)

1. In Play Console, open the app > Grow users > Play Games Services > Setup and management > Configuration, and create a Play Games Services project. Link the Android app with the release and the debug signing SHA-1 fingerprints (Google Cloud OAuth credentials, as Play Console walks you through).
2. Turn on **Saved games** in the Play Games Services properties.
3. Copy the project id (a long number) into `android/app/src/main/res/values/strings.xml` as `game_services_project_id`.
4. Create each achievement and leaderboard listed by `npm run game-services` (`-- --csv` gives a spreadsheet), then paste the generated ids (they look like `CgkI...`) into `ANDROID` in `src/kit/platform-ids.js`.
5. Add test accounts under Play Games Services > Testers, and publish the Play Games configuration when ready.

If the Play Games SDK version in `plugins/game-services/android/build.gradle` is out of date, bump `playGamesVersion` there.
