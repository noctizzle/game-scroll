// Makes the App Store and Google Play screenshots, the Play feature graphic, and the pictures on
// game-scroll.com, by playing real games in the app and framing the captures with a caption.
//
//   npm run build:bundled && node scripts/store-shots.cjs          (or: npm run store-shots)
//
// Writes:
//   store/screenshots/iphone-6.9/*.png    1320 x 2868  (App Store, iPhone 6.9" display; also used for 6.5")
//   store/screenshots/ipad-13/*.png       2064 x 2752  (App Store, iPad 13" display)
//   store/screenshots/android-phone/*.png 1080 x 1920  (Google Play, phone)
//   store/feature-graphic.png             1024 x 500   (Google Play feature graphic)
//   site/img/feed-*.jpg, style-*.jpg, og.png           (game-scroll.com)
// Change a caption or swap a game in SHOTS below, then run it again.
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path'), os = require('os');

const ROOT = path.resolve(__dirname, '..');
const RAW = fs.mkdtempSync(path.join(os.tmpdir(), 'gs-shots-'));
const ONLY = process.argv.slice(2);   // optional: only these outputs, e.g. "android-phone site styles"

// One screenshot per entry, in store order. play: how to get the game to a good-looking moment.
//   taps: tap n times near the middle; hold: keep a finger down (racers); sim: run the game this many
//   seconds ahead at once (3D renders slowly in a headless browser, so countdowns would never end); wait: ms after.
const SHOTS = [
  { id: 'gravity-grip', title: 'Scroll games,', accent: 'not videos', play: { hold: true, sim: 5, wait: 1200 } },
  { id: 'pocket-kart', title: 'Swipe up for', accent: 'the next game', play: { hold: true, sim: 4, wait: 800 } },
  { menu: true, id: 'stack', title: 'Pick a style,', accent: 'or mix them all',
    pad: { id: 'picnic-panic', title: 'Every genre,', accent: 'one feed', play: { taps: 6, wait: 1000 } } },
  { id: 'fossil-dig', title: 'Pixel handheld', accent: 'classics', play: { taps: 10, wait: 600 } },
  { id: 'bunker-breakout', title: 'All the way', accent: 'to HD 3D', play: { taps: 6, wait: 1500 } },
  { id: 'tilt-maze', title: 'Tilt, shake', accent: 'and shout', play: { taps: 4, wait: 1500 } },
  { id: 'stack', start: true, title: 'Win credits,', accent: 'unlock boosts',
    pad: { id: 'snow-swat', title: 'Quick to learn,', accent: 'hard to put down', play: { taps: 8, wait: 600 } } },
];
// On iPad the menu and Stack Up look empty (the phone UI on a big screen), so `pad` swaps in another shot.
const PAD_SHOTS = SHOTS.map(s => s.pad || s);
// The style pictures on the landing page (AR games show their virtual room, since there's no camera here).
const STYLES = { casual: 'bubble-pop', pocket: 'sheep-herder', color: 'fossil-dig', advance: 'pocket-kart', console: 'picnic-panic', nextgen: 'bunker-breakout', ar: 'saucer-swarm' };

const want = k => !ONLY.length || ONLY.includes(k);
const file = p => 'file://' + p;
const FONTS = `
@font-face{font-family:R;font-weight:800;src:url(${file(ROOT + '/node_modules/@fontsource/rubik/files/rubik-latin-800-normal.woff2')})}
@font-face{font-family:R;font-weight:500;src:url(${file(ROOT + '/node_modules/@fontsource/rubik/files/rubik-latin-500-normal.woff2')})}
@font-face{font-family:P;src:url(${file(ROOT + '/node_modules/@fontsource/press-start-2p/files/press-start-2p-latin-400-normal.woff2')})}`;
const BG = 'radial-gradient(90% 60% at 0% 0%,#ff2d8755,transparent 60%),radial-gradient(90% 60% at 100% 100%,#ffc83d40,transparent 60%),#0c0e12';

async function capture(b, { w, h, dpr }, shots, dir) {
  const ctx = await b.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: dpr, isMobile: true, hasTouch: true });
  const p = await ctx.newPage();
  await p.goto('http://localhost:4182/'); await p.waitForFunction(() => window.__gs, null, { timeout: 20000 }); await p.waitForTimeout(1200);
  // A few wins first, so the wallet and shop show some credits (local to this headless browser).
  for (const id of ['stack', 'cave', 'mini-golf', 'pocket-kart', 'fossil-dig', 'tilt-maze']) {
    await p.evaluate(id => { __gs.only(id); }, id); await p.waitForTimeout(150);
    await p.evaluate(() => { __gs.start(); __gs.api(__gs.active).score(__gs.active.def.goal); __gs.api(__gs.active).over(); });
  }
  const out = [];
  for (const [i, s] of shots.entries()) {
    await p.evaluate(id => __gs.only(id), s.id); await p.waitForTimeout(700);
    if (s.menu) { await p.click('#feed-btn'); await p.waitForTimeout(500); }
    else if (s.play) {
      await p.evaluate(() => __gs.start()); await p.waitForTimeout(300);
      const r = await p.evaluate(() => { const c = __gs.active.canvas.getBoundingClientRect(); return { x: c.x, y: c.y, w: c.width, h: c.height }; });
      if (s.play.hold) { await p.mouse.move(r.x + r.w * .5, r.y + r.h * .6); await p.mouse.down(); }
      for (let t = 0; t < (s.play.taps || 0); t++) {
        await p.mouse.move(r.x + r.w * (.3 + .4 * Math.random()), r.y + r.h * (.35 + .4 * Math.random()));
        await p.mouse.down(); await p.waitForTimeout(90); await p.mouse.up(); await p.waitForTimeout(160);
      }
      if (s.play.sim) await p.evaluate(sec => { const g = __gs.active.game; for (let t = 0; t < sec; t += 1 / 30) g.update(1 / 30); }, s.play.sim);
      await p.waitForTimeout(s.play.wait || 500);
    }
    const f = path.join(dir, `${i}.png`);
    await p.screenshot({ path: f, timeout: 180000 }); out.push(f); console.log('captured', s.id, w + 'x' + h);
    if (s.play?.hold) await p.mouse.up();
    if (s.menu) { await p.keyboard.press('Escape'); await p.mouse.click(5, h - 5); await p.waitForTimeout(300); }
  }
  await ctx.close();
  return out;
}

// A store screenshot: caption on top, the capture in a phone/tablet frame below.
function frameHtml(shot, img, { W, H, shotW, radius, pad }) {
  const s = W / 1320;   // type scales with the output width
  return `<!doctype html><style>${FONTS}
  html,body{margin:0;width:${W}px;height:${H}px;overflow:hidden;background:${BG};font-family:R}
  .cap{position:absolute;left:0;right:0;top:${H * .045}px;text-align:center;color:#fff;font-weight:800;font-size:${(W > H ? 104 : 118) * s * (H / W < 1.9 ? .86 : 1)}px;line-height:1.05;letter-spacing:-.01em}
  .cap span{display:block;background:linear-gradient(120deg,#ff2d87,#ff6a2b 55%,#ffc83d);-webkit-background-clip:text;color:transparent}
  .dev{position:absolute;left:50%;top:${H * .175}px;transform:translateX(-50%);width:${shotW}px;padding:${pad}px;border-radius:${radius + pad}px;background:linear-gradient(160deg,#3a3f4b,#121418);box-shadow:0 30px 90px #000a,0 0 0 2px #ffffff18 inset}
  .dev img{display:block;width:100%;border-radius:${radius}px}
  </style><div class="cap">${shot.title}<span>${shot.accent}</span></div><div class="dev"><img src="${file(img)}"></div>`;
}

async function render(b, html, w, h, dpr, out, type = 'png') {
  const f = path.join(RAW, 'page.html'); fs.writeFileSync(f, html);
  const ctx = await b.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: dpr });
  const p = await ctx.newPage(); await p.goto(file(f)); await p.evaluate(() => document.fonts.ready); await p.waitForTimeout(150);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  await p.screenshot({ path: out, type, ...(type === 'jpeg' ? { quality: 82 } : {}) });
  await ctx.close();
}

const slug = s => (s.title + ' ' + s.accent).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

(async () => {
  const server = await (await import('vite')).preview({ preview: { port: 4182 } });
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const phoneDir = fs.mkdtempSync(path.join(RAW, 'phone-')), padDir = fs.mkdtempSync(path.join(RAW, 'pad-'));

  let phone = [];
  if (want('iphone-6.9') || want('android-phone') || want('site') || want('feature')) {
    phone = await capture(b, { w: 390, h: 844, dpr: 3 }, SHOTS, phoneDir);
  }
  if (want('iphone-6.9')) {
    const dir = path.join(ROOT, 'store/screenshots/iphone-6.9'); fs.rmSync(dir, { recursive: true, force: true });
    for (const [i, s] of SHOTS.entries())
      await render(b, frameHtml(s, phone[i], { W: 440, H: 956, shotW: 330, radius: 40, pad: 9 }), 440, 956, 3, path.join(dir, `${i + 1}-${slug(s)}.png`));
  }
  if (want('android-phone')) {
    const dir = path.join(ROOT, 'store/screenshots/android-phone'); fs.rmSync(dir, { recursive: true, force: true });
    for (const [i, s] of SHOTS.entries())
      await render(b, frameHtml(s, phone[i], { W: 360, H: 640, shotW: 250, radius: 30, pad: 7 }), 360, 640, 3, path.join(dir, `${i + 1}-${slug(s)}.png`));
  }
  if (want('ipad-13')) {
    const pad = await capture(b, { w: 820, h: 1180, dpr: 2 }, PAD_SHOTS, padDir);
    const dir = path.join(ROOT, 'store/screenshots/ipad-13'); fs.rmSync(dir, { recursive: true, force: true });
    for (const [i, s] of PAD_SHOTS.entries())
      await render(b, frameHtml(s, pad[i], { W: 1032, H: 1376, shotW: 760, radius: 30, pad: 12 }), 1032, 1376, 2, path.join(dir, `${i + 1}-${slug(s)}.png`));
  }

  // Feature graphic (Play) and the social preview image (site): logo, tagline, three phones.
  const promo = (W, H, imgs) => `<!doctype html><style>${FONTS}
    html,body{margin:0;width:${W}px;height:${H}px;overflow:hidden;background:${BG};font-family:R;color:#fff}
    .l{position:absolute;left:${W * .06}px;top:50%;transform:translateY(-50%);width:${W * .5}px}
    .logo{display:flex;align-items:center;gap:${H * .04}px;font:${H * .045}px/1.35 P;margin-bottom:${H * .07}px}
    .logo img{width:${H * .16}px;border-radius:${H * .036}px}.logo b{color:#f4c247;font-weight:400}
    h1{margin:0;font-size:${H * .14}px;line-height:1.02;font-weight:800}
    h1 span{background:linear-gradient(120deg,#ff2d87,#ff6a2b 55%,#ffc83d);-webkit-background-clip:text;color:transparent}
    p{margin:${H * .05}px 0 0;font-weight:500;font-size:${H * .052}px;color:#d6d9d2}
    .ph{position:absolute;width:${H * .5}px;padding:${H * .012}px;border-radius:${H * .06}px;background:linear-gradient(160deg,#3a3f4b,#121418);box-shadow:0 20px 50px #000b}
    .ph img{display:block;width:100%;border-radius:${H * .05}px}
  </style><div class="l"><div class="logo"><img src="${file(ROOT + '/public/icons/icon-512.png')}"><span>GAME<br><b>SCROLL</b></span></div>
  <h1>Scroll <span>games</span>,<br>not videos.</h1><p>A feed of quick mini games. Swipe up, tap to play.</p></div>
  ${imgs.map((f, i) => `<div class="ph" style="left:${W * (.58 + i * .135)}px;top:${H * (.1 + (i % 2) * .16)}px;transform:rotate(${[-7, 4, -3][i]}deg)"><img src="${file(f)}"></div>`).join('')}`;
  if (want('feature')) await render(b, promo(1024, 500, [phone[0], phone[4], phone[1]]), 1024, 500, 1, path.join(ROOT, 'store/feature-graphic.png'));

  const img = path.join(ROOT, 'site/img'); fs.mkdirSync(img, { recursive: true });
  if (want('site')) {
    await render(b, promo(1200, 630, [phone[0], phone[4], phone[1]]), 1200, 630, 1, path.join(img, 'og.png'));
    // feed reel in the hero phone: the raw captures, smaller, as JPEG
    const reel = [0, 1, 3, 4, 5, 6];
    for (const [n, i] of reel.entries())
      await render(b, `<style>html,body{margin:0}img{display:block;width:390px}</style><img src="${file(phone[i])}">`, 390, 844, 2, path.join(img, `feed-${n + 1}.jpg`), 'jpeg');
  }
  if (want('site') || want('styles')) {
    // style pictures: each game on a landscape screen, so the whole game card shows
    const ctx = await b.newContext({ viewport: { width: 800, height: 600 }, deviceScaleFactor: 2, hasTouch: true });
    const p = await ctx.newPage(); await p.goto('http://localhost:4182/'); await p.waitForFunction(() => window.__gs, null, { timeout: 20000 }); await p.waitForTimeout(1200);
    for (const [k, id] of Object.entries(STYLES)) {
      await p.evaluate(id => __gs.only(id), id); await p.waitForTimeout(500);
      await p.evaluate(() => __gs.start()); await p.waitForTimeout(300);
      const r = await p.evaluate(() => { const c = __gs.active.canvas.getBoundingClientRect(); return { x: c.x, y: c.y, w: c.width, h: c.height }; });
      for (let t = 0; t < 6; t++) { await p.mouse.click(r.x + r.w * (.3 + .4 * Math.random()), r.y + r.h * (.4 + .3 * Math.random())); await p.waitForTimeout(200); }
      if (k === 'ar') {   // let the saucers fly in, then drag the view round to face them
        await p.evaluate(() => { const g = __gs.active.game; for (let t = 0; t < 6; t += 1 / 30) g.update(1 / 30); });
        const cx = r.x + r.w / 2, cy = r.y + r.h / 2;
        await p.mouse.move(cx, cy); await p.mouse.down(); await p.mouse.move(cx - 70, cy, { steps: 8 }); await p.mouse.up();
      }
      await p.waitForTimeout(1200);
      // just the game and its frame, not the app around it
      const st = await p.evaluate(() => { const r = __gs.active.canvas.closest('.stage').getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height }; });
      await p.screenshot({ path: path.join(img, `style-${k}.jpg`), type: 'jpeg', quality: 82, clip: st });
    }
    await ctx.close();
  }

  await b.close(); server.httpServer.close();
  fs.rmSync(RAW, { recursive: true, force: true });
  console.log('store and site images written');
})();
