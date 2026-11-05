# Installing the iPhone app without the App Store

Until there is a paid Apple Developer account, the iOS build is an unsigned `.ipa`. A free tool signs it with the tester's own Apple ID and puts it on their iPhone. It works with a free Apple ID, but Apple makes the app stop opening after 7 days, so it has to be reinstalled weekly (progress is kept if it's reinstalled over the top).

## Getting the file (Rob)

1. Run the build: https://github.com/robthewizzuk/game-scroll/actions/workflows/ios-ipa.yml → **Run workflow**. It takes about 10 minutes.
2. Download `game-scroll.ipa` from https://github.com/robthewizzuk/game-scroll/releases/tag/ios-latest (the repo is private, so you have to be signed in).
3. Send the file to your friend, for example by email, Google Drive or AirDrop.

## Installing it (the tester)

You need a Windows PC or a Mac, a USB cable for the iPhone, and an Apple ID. A spare Apple ID is fine; the password is only sent to Apple.

1. Install **Sideloadly** from https://sideloadly.io. On Windows, also install iTunes and iCloud from Apple's website (not the Microsoft Store versions).
2. Plug the iPhone in, unlock it, and tap **Trust** if it asks.
3. Open Sideloadly, drag `game-scroll.ipa` onto it, type your Apple ID email, and click **Start**. Enter your Apple ID password and any 2-factor code when asked.
4. On the iPhone, turn on Developer Mode: **Settings → Privacy & Security → Developer Mode**, switch it on and restart. (It only appears after the first sideload.)
5. Trust the app: **Settings → General → VPN & Device Management**, tap your Apple ID, then **Trust**.
6. Open Game Scroll.

After 7 days the app won't open. Repeat step 3 with the latest `.ipa` to renew it. A free Apple ID can have up to 3 sideloaded apps at once.

When there is a paid developer account, this will switch to TestFlight, which needs no computer and doesn't expire weekly.
