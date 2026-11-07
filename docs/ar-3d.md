# AR · 3D games: 3D in your real room

AR games (`era: 'ar'`) put 3D objects into the player's real room. The back camera picture fills the
screen and the phone's gyro turns the 3D camera, so a saucer, a bin or a hoop stays where it is in
the room while you move the phone around. It is "look-around" AR (3 degrees of freedom): you turn,
tilt and look up and down on the spot; walking around is not tracked.

The kit is `src/kit/ar3d.js`, built on the Next Gen renderer (`src/kit/hd3d.js`): physically based
materials, reflections, and real-time shadows that fall on the real floor (an invisible floor that
only shows shadows). Bloom and the colour grade are left out, because they would also tint the real
world behind the scene. Games built on it: `saucer-swarm.js`, `bin-flick.js`, `hoop-drone.js`.

## Fitting the real room

- **Floor calibration.** The first time the camera starts, the kit opens "Line up your floor": the
  player points at the floor and drags a teal grid up or down until it lies flat on it, then taps
  Done. That sets how high the phone is held (saved on the device), and the 3D camera sits at
  `FLOOR + v.eyeH`, so anything a game puts at `y = FLOOR` stands on the real floor. A small
  "⇕ Floor" chip (bottom left, while the camera is on) reopens it. While it's open
  `v.calibrating` is true: games must skip their update (that pauses timers and enemies) and send
  their input through `v.input(...)` first.
- **Light estimation.** Every few frames the camera picture is shrunk to 8 x 6 pixels; its average
  brightness and colour drive the sky light, sun and reflections, so objects get darker in a dim
  room and pick up warm or cool light.
- **Less drift.** On Android the kit uses the compass-locked orientation
  (`deviceorientationabsolute`), so "straight ahead" can't slowly turn. iPhones use the gyro reading, which drifts very
  little over a short game.

## Fallbacks (every AR game must play everywhere)

- **No camera** (refused, desktop, web): a virtual room (wooden floor, painted walls) is drawn
  instead, and the game plays the same.
- **No gyro** (desktop, motion refused): the player drags on the screen to look around
  (`v.drag(dx, dy)`). Games where dragging is already the control (Bin Flick's flick) should keep
  their targets in view instead.
- `arNote(c, v, W, H)` draws a small note at the bottom saying which fallback is on.

## Writing an AR game

```js
import { haptic, want } from '../kit/device.js';
import { ARView, arNote, FLOOR } from '../kit/ar3d.js';
import { Particles, pbr, rbox, THREE } from '../kit/hd3d.js';

function make(api) {
  want('motion');                  // iPhones ask for motion access on the Play tap
  let v;
  return {
    reset() { v?.off(); v?.recenter(); /* ... */ },     // stop the camera; "ahead" = where the phone points next
    update(dt) { if (!v) return; v.live(); if (v.calibrating) return; /* ... */ if (lost) { v.off(); api.over(); } },
    down(x, y, id) { if (v?.input?.('down', x, y, id)) return; /* ... */ },          // same for move (pass pressed) and up
    draw(c) {
      if (!v) { v = new ARView(); /* build meshes, add to v.scene */ this.reset(); }
      v.look();                    // gyro (or drag) -> camera
      v.draw(c, W, H);             // camera picture + 3D scene
      v.pointers(c, W, H, [{ p: target, col: '#8affdc' }]);   // edge arrows to things off screen
      /* 2D HUD */ arNote(c, v, W, H);
    },
  };
}
```

- The floor is at `y = FLOOR` (-1.3) and the phone (the eye) is at `v.eyePos`: above the origin by
  however the player calibrated (1.3 m above the floor until then). Aim rays start at `v.eyePos`. Straight ahead at the start is `-z`. Put things 1.5 to 7 m away at real-world sizes
  (a bin is 38 cm tall, a saucer 80 cm across) so they look right on the real floor.
- `v.forward()`, `v.heading()` and `v.offAim(p)` tell you where the phone points; `v.toScreen(x, y, z)`
  gives screen coordinates for tap tests and labels.
- `v.seeing` is true while the camera picture shows, `v.sensor` while the gyro drives the view.
- Spread targets round the player to make them turn (behind them too), and always add edge arrows
  so they can find them.
- The 3D lens is matched to the camera's field of view (about 64 degrees on the long side), so
  placed objects don't slide against the room as you turn.
- Stop the camera (`v.off()`) in `reset()` and before `api.over()`. The kit also stops it when the
  app goes to the background.

Game definition:

```js
export default {
  id: 'my-ar-game', title: 'My AR Game', tag: 'AR · Shooter',
  retro: true, era: 'ar', pal: 'grape',
  w: 300, h: 460, maxW: 600, maxH: 680,   // fluid: fills tall phones and unfolded foldables
  goal: 20, hint: '... through the camera ... No camera? Drag to look around.', make,
};
```

## Testing

`npm run smoke`, `npm run fold` and `node scripts/sweep.cjs <id>` run AR games with the virtual room.
To see the camera path in headless Chromium, launch it with
`--use-fake-device-for-media-stream --use-fake-ui-for-media-stream --use-file-for-fake-video-capture=room.y4m`,
grant the `camera` permission, make `DeviceMotionEvent.requestPermission` resolve `'granted'`, start
the game with a real click (motion access is asked on the Play tap), and dispatch
`Object.assign(new Event('deviceorientation'), { alpha, beta: 90, gamma: 0 })` to turn the phone.
