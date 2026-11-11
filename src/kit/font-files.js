// The font library's files (gs.fonts and gs.pixel.text). They ship inside the app, and a file is
// only fetched when a game first names its font. Loaded by src/kit/fontlib.js on first use.
// Each key is '<font name in lower case> <weight>'.
import bangers from '@fontsource/bangers/files/bangers-latin-400-normal.woff2?url';
import fredoka4 from '@fontsource/fredoka/files/fredoka-latin-400-normal.woff2?url';
import fredoka7 from '@fontsource/fredoka/files/fredoka-latin-700-normal.woff2?url';
import titan from '@fontsource/titan-one/files/titan-one-latin-400-normal.woff2?url';
import bungee from '@fontsource/bungee/files/bungee-latin-400-normal.woff2?url';
import orbitron5 from '@fontsource/orbitron/files/orbitron-latin-500-normal.woff2?url';
import orbitron8 from '@fontsource/orbitron/files/orbitron-latin-800-normal.woff2?url';
import creepster from '@fontsource/creepster/files/creepster-latin-400-normal.woff2?url';
import pirata from '@fontsource/pirata-one/files/pirata-one-latin-400-normal.woff2?url';
import rye from '@fontsource/rye/files/rye-latin-400-normal.woff2?url';
import monoton from '@fontsource/monoton/files/monoton-latin-400-normal.woff2?url';
import blackops from '@fontsource/black-ops-one/files/black-ops-one-latin-400-normal.woff2?url';
import cinzel4 from '@fontsource/cinzel/files/cinzel-latin-400-normal.woff2?url';
import cinzel7 from '@fontsource/cinzel/files/cinzel-latin-700-normal.woff2?url';
import hand from '@fontsource/patrick-hand/files/patrick-hand-latin-400-normal.woff2?url';
import courier4 from '@fontsource/courier-prime/files/courier-prime-latin-400-normal.woff2?url';
import courier7 from '@fontsource/courier-prime/files/courier-prime-latin-700-normal.woff2?url';
import silk4 from '@fontsource/silkscreen/files/silkscreen-latin-400-normal.woff2?url';
import silk7 from '@fontsource/silkscreen/files/silkscreen-latin-700-normal.woff2?url';
import vt323 from '@fontsource/vt323/files/vt323-latin-400-normal.woff2?url';
import tiny5 from '@fontsource/tiny5/files/tiny5-latin-400-normal.woff2?url';
import jersey from '@fontsource/jersey-10/files/jersey-10-latin-400-normal.woff2?url';

export const FILES = {
  'bangers 400': bangers, 'fredoka 400': fredoka4, 'fredoka 700': fredoka7, 'titan one 400': titan, 'bungee 400': bungee,
  'orbitron 500': orbitron5, 'orbitron 800': orbitron8, 'creepster 400': creepster, 'pirata one 400': pirata, 'rye 400': rye,
  'monoton 400': monoton, 'black ops one 400': blackops, 'cinzel 400': cinzel4, 'cinzel 700': cinzel7, 'patrick hand 400': hand,
  'courier prime 400': courier4, 'courier prime 700': courier7,
  'silkscreen 400': silk4, 'silkscreen 700': silk7, 'vt323 400': vt323, 'tiny5 400': tiny5, 'jersey 10 400': jersey,
};
