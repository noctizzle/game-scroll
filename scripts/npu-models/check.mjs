// Checks the models in ml-models/<NPU_VERSION>/ against the SHA-256s in src/kit/npu-files.js (the app
// only runs files that match), so the npu-models workflow never uploads a file the app would turn away.
//   node scripts/npu-models/check.mjs [dir]       (default ml-models; dir holds the NPU_VERSION folder)
import { readFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { NPU_VERSION, NPU_FILES } from '../../src/kit/npu-files.js';

const dir = join(process.argv[2] || 'ml-models', NPU_VERSION), bad = [];
for (const [f, want] of Object.entries(NPU_FILES)) {
  const p = join(dir, f);
  if (!existsSync(p)) { bad.push(`${f}: missing`); continue; }
  const have = createHash('sha256').update(readFileSync(p)).digest('hex');
  if (have !== want) bad.push(`${f}: ${have}, but src/kit/npu-files.js says ${want}`);
}
if (bad.length) {
  console.error(`The models in ${dir} are not the ones the app expects:\n  ${bad.join('\n  ')}\n` +
    'If the models changed on purpose, bump NPU_VERSION, commit the new folder and put the new SHA-256s (convert.py prints them) in src/kit/npu-files.js.');
  process.exit(1);
}
console.log(`${Object.keys(NPU_FILES).length} model files match src/kit/npu-files.js.`);
