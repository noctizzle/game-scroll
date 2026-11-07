# Crash and stutter reports

The app reports crashes, script errors and frame drops from real phones to the API Worker
(`api.game-scroll.com`, same Worker and D1 database as hearts and play stats). Nothing identifies
the player, and it uses the same switch as play stats: **Settings → Share anonymous play stats and
crash reports**.

## Where to look

- **Web page:** <https://api.game-scroll.com/perf/report>. Crashes, script errors, then smoothness
  per game and phone model, worst first. Last 14 days, refreshed every 5 minutes.
- **In the app:** tap the GAME SCROLL logo for the QA panel. Each game shows "this phone" and
  "everyone" fps / slow frames / freezes, there's a **Crashes & stutters ↗** link to the page above,
  and **Copy report** now includes the worst stutters and the top crashes and errors.
- **Raw JSON:** `GET https://api.game-scroll.com/perf`.

## What the numbers mean

Frames are timed only while a round is playing (not while scrolling the feed or paused).

| Column | Meaning |
| --- | --- |
| Avg fps | Frames per second over all rounds. 60 is smooth on most phones; 120 Hz screens can go higher. |
| Slow | Share of frames that took 25 ms or more (under 40 fps). Over 3% shows amber, over 10% red. |
| Freezes | Frames of 70 ms or more: a hitch the player feels. Freezes/min over 2 is amber, over 6 red. |
| Longest | The single worst frame. One big number at the start of a round is often 3D shaders compiling. |
| Busy | How much of each frame the game's own code and drawing took. High busy + low fps: the game is too heavy. Low busy + low fps: the GPU, heat or battery saver. |
| Screen | `wide` is a tablet-sized screen (shortest side 600 px or more), like an unfolded Galaxy Z Fold. `phone` is everything else, so folded and unfolded show as separate rows. |

**Crash** means the app closed or reloaded while it was on screen, without going to the background
first. On phones that's almost always the system killing it for memory (the WebView's GPU process,
for big 3D scenes). The report names the game that was open and whether a round was playing.
Crashes right after installing a new build aren't counted.

**Script error** means a game threw an error. The app ends that round and carries on. Streamed
games report as `games/<id>.js:<line>`, so the line points into that game's file.

## What is sent

About once a minute while the app is open (and when it goes to the background):

- phone model as the system reports it (e.g. `SM-F966B`, `iPhone17,1`), OS version, app build
  (`1.0.<CI run> <commit>`), and `phone` or `wide`
- per game: rounds, frames, frame time, busy time, slow frames, freezes, longest frame
- up to 10 errors: kind, game, message (160 characters, URLs cut down to the file name), file:line

The random install id goes along only as a rate-limit key and isn't stored. The server keeps daily
totals per game, model, screen class and build, and deletes anything older than 14 days.

For the App Store privacy label this is "Diagnostics: crash data, performance data, other
diagnostic data", **not linked** to the user and **not used for tracking**. On Google Play's data
safety form it's "App info and performance: crash logs, diagnostics", not shared, optional
(the Settings switch).

## Not covered

Native crashes inside Android or iOS code (rare for this app, since everything runs in the WebView)
show up for free in the Play Console (Android vitals) and App Store Connect / Xcode Organizer once
the app is in the stores.
