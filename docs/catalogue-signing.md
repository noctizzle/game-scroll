# Signed game catalogue

Games stream into the app from the games host (`assets.game-scroll.com`, Cloudflare R2). The host is
just storage, so the app doesn't simply trust whatever is there. It only runs games listed in a
catalogue **signed in CI with a key that only GitHub has**.

## How it works

1. On every push to `main`, `.github/workflows/games-r2.yml` builds the games (`scripts/build-games.mjs`).
   `manifest.json` lists each game with the full SHA-256 of its file.
2. `scripts/sign-catalogue.mjs` signs the exact text of `manifest.json` with the private key from the
   repo secret `CATALOGUE_SIGNING_KEY` (ECDSA P-256), and writes `catalogue.json`:
   `{ "v": 2, "data": "<manifest.json text>", "sig": "<base64 signature>" }`.
3. The workflow uploads the game files, then `catalogue.json`, then `manifest.json`.
4. The app (`src/remote.js`) has the matching public key built in (`VITE_CATALOGUE_KEY` in `.env`).
   It downloads `catalogue.json` and checks that:
   - the signature matches the public key (otherwise the catalogue is ignored and the saved one stays),
   - it isn't older than the catalogue it already has (so an old catalogue can't be replayed),
   - every game file it downloads has exactly the SHA-256 listed (otherwise that game is skipped).

**Adding or fixing games doesn't change.** Merge the PR and the workflow signs the new catalogue on
its own. Phones pick it up within about a minute, with no app update. Only the public key is built
into the app, not the list of games.

`manifest.json` is still uploaded unsigned for app builds made before signing, and for the API
Worker, which uses it to check game ids.

`npm run catalogue-test` checks all of this end to end with a throwaway key: a good catalogue plays,
and a swapped game file, an edited catalogue, another key, an older catalogue and calls to other
servers are all refused.

## One-time setup (Rob)

Do these in this order. The workflow refuses to publish if the app has a key but the secret is missing.

1. Make the key pair, in a copy of the repo on your computer or in a GitHub Codespace:
   ```bash
   node scripts/sign-catalogue.mjs --new-key
   ```
   It saves the private key to `catalogue-signing-key.pem` (git ignores it) and prints a line like
   `VITE_CATALOGUE_KEY=MFkwEwYH...`.
2. On GitHub, go to **Settings → Secrets and variables → Actions → New repository secret**.
   Name it `CATALOGUE_SIGNING_KEY`, paste the whole `.pem` file, and save.
3. Keep a backup of the `.pem` file somewhere safe and offline, such as a password manager, then
   delete the file. Never commit it or paste it into chat.
4. Put the printed `VITE_CATALOGUE_KEY=...` line into `.env`. The public key is safe to share, so
   you can also send it to Claude to add. Merging that change makes the games workflow sign the
   catalogue, and app builds from then on check the signature.

Before step 4, everything keeps working as it does now: the app reads the unsigned `manifest.json`.

## If the key leaks

Make a new pair (steps 1 to 4), then ship an app update with the new public key. Phones still on the
old app can't verify the new catalogue, so they keep their saved games until they update.
