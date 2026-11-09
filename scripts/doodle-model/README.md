# The doodle model (gs.doodle)

`src/kit/doodle-model.js` is made here; it isn't trained in CI. To change the things it knows, edit
`classes.json` (names from the [Quick, Draw! dataset](https://github.com/googlecreativelab/quickdraw-dataset),
CC BY 4.0) and copy the list into `THINGS` in `src/kit/doodle.js`, then:

```bash
pip install numpy torch
python3 scripts/doodle-model/fetch.py qd-data      # 12,000 drawings of each thing (28 x 28 bitmaps)
python3 scripts/doodle-model/train.py qd-data      # about 6 minutes on a laptop CPU; writes src/kit/doodle-model.js
npm run kit-test                                   # the doodle checks
```

The network is three 3x3 convolutions (16, 32, 64 channels, each with ReLU and 2x2 max pooling)
and two dense layers (128, then one per thing), stored as int8 with one scale per tensor (about
100 KB). `src/kit/doodle.js` runs it in plain JavaScript and draws the player's strokes into the same
kind of 28 x 28 picture the dataset uses. With 46 things: 90% right on held-out drawings.
