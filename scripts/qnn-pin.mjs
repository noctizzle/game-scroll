// Pins Qualcomm's NPU libraries (QNN) that the Android app downloads on phones with a supported
// Snapdragon NPU, instead of carrying them in every APK (they are ~57 MB of an ~85 MB APK).
//
//   node scripts/qnn-pin.mjs          fetch Qualcomm's release from Maven Central and write the pin file
//   node scripts/qnn-pin.mjs --check  (offline) the pin file matches the ONNX Runtime in build.gradle
//
// The source is Qualcomm's own release on Maven Central (com.qualcomm.qti:qnn-runtime), the same
// version ONNX Runtime's QNN package was built against. The phone fetches only the files it needs
// from that file with range requests, unpacks them, and keeps them only if each one's SHA-256 is the
// one written here, so a changed or broken download is never loaded (plugins/npu/.../QnnRuntime.java).
// Run it again after changing the ONNX Runtime version in plugins/npu/android/build.gradle.
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { inflateRawSync } from 'node:zlib';

const GRADLE = 'plugins/npu/android/build.gradle';
const PIN = 'plugins/npu/android/src/main/assets/qnn-runtime.json';
const MAVEN = 'https://repo1.maven.org/maven2';

// Snapdragon phone chips (Build.SOC_MODEL) and their NPU (Hexagon HTP) generation, from Qualcomm's
// "Supported Snapdragon devices" table (QAIRT docs, QNN overview). Only V73 (Snapdragon 8 Gen 2) and
// newer: older NPUs are slower than the CPU path for our models. A chip not listed here downloads
// nothing and uses the CPU; add new chips here (and to ARCHS if it's a new generation).
const SOCS = {
  SM8550: 73,  // Snapdragon 8 Gen 2
  SM8635: 73,  // Snapdragon 8s Gen 3
  SM7675: 73,  // Snapdragon 7+ Gen 3
  SM6450: 73,  // Snapdragon 6 Gen 1
  SM8650: 75,  // Snapdragon 8 Gen 3
  SM8750: 79,  // Snapdragon 8 Elite
  SM8850: 81,  // Snapdragon 8 Elite Gen 5
};
const ARCHS = [73, 75, 79, 81];
const COMMON = ['libQnnHtp.so', 'libQnnSystem.so', 'libQnnHtpPrepare.so'];
const WANT = [...COMMON, ...ARCHS.flatMap(a => [`libQnnHtpV${a}Stub.so`, `libQnnHtpV${a}Skel.so`])];

const ort = readFileSync(GRADLE, 'utf8').match(/def ort = '([\d.]+)'/)?.[1];
if (!ort) throw new Error(`${GRADLE}: no "def ort = '…'" line`);

if (process.argv.includes('--check')) {
  const pin = JSON.parse(readFileSync(PIN, 'utf8'));
  const bad = [];
  if (pin.ort !== ort) bad.push(`${PIN} was made for ONNX Runtime ${pin.ort}, but ${GRADLE} uses ${ort}: run node scripts/qnn-pin.mjs`);
  for (const f of WANT) if (!/^[0-9a-f]{64}$/.test(pin.files?.[f]?.sha256 || '')) bad.push(`${PIN}: no ${f}`);
  if (JSON.stringify(pin.socs) !== JSON.stringify(SOCS)) bad.push(`${PIN}: the chip list differs from scripts/qnn-pin.mjs: run node scripts/qnn-pin.mjs`);
  if (bad.length) { console.error(bad.join('\n')); process.exit(1); }
  console.log(`QNN ${pin.qnn} pinned for ONNX Runtime ${ort}: ${Object.keys(pin.files).length} files, ${Object.keys(pin.socs).length} chips`);
  process.exit(0);
}

const get = async (url, as = 'text') => {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${url}: ${r.status}`);
  return as === 'text' ? r.text() : Buffer.from(await r.arrayBuffer());
};

const pom = await get(`${MAVEN}/com/microsoft/onnxruntime/onnxruntime-android-qnn/${ort}/onnxruntime-android-qnn-${ort}.pom`);
const qnn = pom.match(/<artifactId>qnn-runtime<\/artifactId>\s*<version>([^<]+)<\/version>/)?.[1];
if (!qnn) throw new Error(`onnxruntime-android-qnn ${ort} doesn't name a qnn-runtime version`);
const url = `${MAVEN}/com/qualcomm/qti/qnn-runtime/${qnn}/qnn-runtime-${qnn}.aar`;
console.log(`ONNX Runtime ${ort} uses QNN ${qnn}: ${url}`);
const aar = await get(url, 'buffer');
const sha1 = (await get(url + '.sha1')).trim().split(/\s/)[0];
if (createHash('sha1').update(aar).digest('hex') !== sha1) throw new Error('the download does not match Maven Central\'s checksum');

// The zip's central directory, then each wanted file's local header, for where its packed bytes start.
let eocd = aar.length - 22;
while (eocd >= 0 && aar.readUInt32LE(eocd) !== 0x06054b50) eocd--;
if (eocd < 0) throw new Error('not a zip');
const count = aar.readUInt16LE(eocd + 10);
let p = aar.readUInt32LE(eocd + 16);
const files = {};
for (let i = 0; i < count; i++) {
  if (aar.readUInt32LE(p) !== 0x02014b50) throw new Error('bad zip directory');
  const method = aar.readUInt16LE(p + 10), packed = aar.readUInt32LE(p + 20), size = aar.readUInt32LE(p + 24);
  const nameLen = aar.readUInt16LE(p + 28), extraLen = aar.readUInt16LE(p + 30), commentLen = aar.readUInt16LE(p + 32);
  const local = aar.readUInt32LE(p + 42), name = aar.toString('utf8', p + 46, p + 46 + nameLen);
  p += 46 + nameLen + extraLen + commentLen;
  const base = name.split('/').pop();
  if (!name.startsWith('jni/arm64-v8a/') || !WANT.includes(base)) continue;
  if (method !== 8 && method !== 0) throw new Error(`${name}: packed in an unknown way (${method})`);
  if (aar.readUInt32LE(local) !== 0x04034b50) throw new Error(`${name}: bad local header`);
  const at = local + 30 + aar.readUInt16LE(local + 26) + aar.readUInt16LE(local + 28);
  const raw = aar.subarray(at, at + packed), data = method === 8 ? inflateRawSync(raw) : raw;
  if (data.length !== size) throw new Error(`${name}: unpacked to the wrong size`);
  files[base] = { at, packed, size, deflate: method === 8, sha256: createHash('sha256').update(data).digest('hex') };
}
const missing = WANT.filter(f => !files[f]);
if (missing.length) throw new Error(`QNN ${qnn} has no ${missing.join(', ')}`);

const pin = {
  _: 'Written by scripts/qnn-pin.mjs: do not edit. Qualcomm\'s NPU libraries, which debug (sideloaded) builds download on the phones in socs.',
  ort, qnn, url,
  sha256: createHash('sha256').update(aar).digest('hex'),
  files: Object.fromEntries(WANT.map(f => [f, files[f]])),
  socs: SOCS,
};
writeFileSync(PIN, JSON.stringify(pin, null, 2) + '\n');
const mb = n => (n / 1e6).toFixed(1) + ' MB';
for (const a of ARCHS) {
  const need = [...COMMON, `libQnnHtpV${a}Stub.so`, `libQnnHtpV${a}Skel.so`];
  console.log(`V${a} phone downloads ${mb(need.reduce((s, f) => s + files[f].packed, 0))} (${mb(need.reduce((s, f) => s + files[f].size, 0))} unpacked)`);
}
console.log(`wrote ${PIN}`);
