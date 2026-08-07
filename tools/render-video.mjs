#!/usr/bin/env node
/* ---------------------------------------------------------------------------
   render-video.mjs — vyrenderuje video přímo ze stránky zatmeni-2026-v2.html

   Nevykresluje nic vlastního. Řídí headless Chromium, ve kterém běží ta samá
   stránka, co poběží na zdi, posouvá jí čas snímek po snímku přes
   window.eclipseExport a snímky sype rovnou do ffmpegu. Jeden renderer,
   žádná druhá implementace, která by se časem rozešla.

   Instalace:
     cd tools && npm install && npx playwright install chromium
     (a systémový ffmpeg: apt install ffmpeg)

   Základní běh — 2,5 h reálného času od 19:00 SELČ, po 20minutových dílech:
     cd tools && npm run render

   Parametry (všechny volitelné):
     --html=cesta          vstupní HTML                       (../index.html)
     --out=adresar         kam ukládat                 (video)
     --start=ISO           začátek v UTC               (2026-08-12T17:00:00Z)
     --end=ISO             konec v UTC                 (2026-08-12T19:30:00Z)
     --speed=N             N× reálný čas, 1 = reálný   (1)
     --fps=N               snímků za sekundu           (10)
     --chunk=N             minut videa na soubor, 0 = jeden celek   (20)
     --width, --height     rozlišení                   (2080 × 1560)
     --k=N                 měřítko rozhraní            (1.7)
     --view=sites|map|alt  scéna, alt = střídání       (alt)
     --altSec=N            po kolika sekundách střídat (120)
     --lean                skryje tabulku údajů
     --chrome              nechá spodní lištu viditelnou
     --codec=jpeg|png      formát snímků do ffmpegu    (jpeg)
     --quality=N           kvalita jpegu 1–100         (92)
     --crf=N               kvalita h.264, níž = lepší  (20)
     --preset=NAME         x264 preset                 (medium)
     --hash=RETEZEC        konfigurace stanovišť, viz odkaz z aplikace
     --probe=N             jen N testovacích PNG místo videa
--------------------------------------------------------------------------- */

import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';

/* ---------- parametry ---------- */
const argv = Object.fromEntries(process.argv.slice(2).map(a => {
  const m = /^--([^=]+)(?:=(.*))?$/.exec(a);
  return m ? [m[1], m[2] === undefined ? true : m[2]] : [a, true];
}));

const CFG = {
  html:    argv.html    || new URL('../index.html', import.meta.url).pathname,
  out:     argv.out     || 'video',
  start:   Date.parse(argv.start || '2026-08-12T17:00:00Z'),
  end:     Date.parse(argv.end   || '2026-08-12T19:30:00Z'),
  speed:   Number(argv.speed   ?? 1),
  fps:     Number(argv.fps     ?? 10),
  chunk:   Number(argv.chunk   ?? 20),
  width:   Number(argv.width   ?? 2080),
  height:  Number(argv.height  ?? 1560),
  k:       Number(argv.k       ?? 1.7),
  view:    argv.view    || 'alt',
  altSec:  Number(argv.altSec  ?? 120),
  lean:    !!argv.lean,
  bare:    !argv.chrome,
  codec:   argv.codec   || 'jpeg',
  quality: Number(argv.quality ?? 92),
  crf:     Number(argv.crf     ?? 20),
  preset:  argv.preset  || 'medium',
  hash:    argv.hash    || '',
  probe:   argv.probe ? Number(argv.probe) : 0,
};

if (!Number.isFinite(CFG.start) || !Number.isFinite(CFG.end) || CFG.end <= CFG.start)
  throw new Error('Neplatné --start / --end.');
if (CFG.width % 2 || CFG.height % 2)
  throw new Error('h.264 potřebuje sudé rozlišení.');

const outSeconds  = (CFG.end - CFG.start) / 1000 / CFG.speed;
const totalFrames = Math.round(outSeconds * CFG.fps);
const perChunk    = CFG.chunk > 0 ? Math.round(CFG.chunk * 60 * CFG.fps) : totalFrames;
const chunks      = Math.ceil(totalFrames / perChunk);
const ext         = CFG.codec === 'png' ? 'png' : 'jpg';

const hhmmss = s => [s / 3600, (s % 3600) / 60, s % 60]
  .map(v => String(Math.floor(v)).padStart(2, '0')).join(':');

console.log(`vstup       ${CFG.html}`);
console.log(`úsek        ${new Date(CFG.start).toISOString()} → ${new Date(CFG.end).toISOString()}`);
console.log(`výstup      ${hhmmss(outSeconds)} při ${CFG.speed}× · ${CFG.fps} fps · ${CFG.width}×${CFG.height}`);
console.log(`snímků      ${totalFrames} v ${chunks} soubor(ech) po ${hhmmss(perChunk / CFG.fps)}\n`);

fs.mkdirSync(CFG.out, { recursive: true });

/* ---------- prohlížeč ---------- */
const htmlPath = path.resolve(CFG.html);
if (!fs.existsSync(htmlPath)) throw new Error(`Nenašel jsem ${htmlPath}`);
const url = pathToFileURL(htmlPath).href + (CFG.hash ? '#' + CFG.hash.replace(/^#/, '') : '');

const browser = await chromium.launch({ args: ['--force-color-profile=srgb', '--disable-lcd-text'] });
const page = await browser.newPage({
  viewport: { width: CFG.width, height: CFG.height },
  deviceScaleFactor: 1,
});
page.on('pageerror', e => console.error('CHYBA VE STRÁNCE:', e.message));

await page.goto(url, { waitUntil: 'load' });
await page.waitForFunction(() => window.eclipseExport && document.getElementById('siteField'), null, { timeout: 60000 });
await page.evaluate(() => document.fonts ? document.fonts.ready.then(() => true) : true);
await page.waitForTimeout(1200);   // dopočet pásu totality při startu

const ok = await page.evaluate(o => window.eclipseExport.begin(o), {
  view: CFG.view, altSec: CFG.altSec, startMs: CFG.start,
  bare: CFG.bare, lean: CFG.lean, k: CFG.k,
});
if (!ok) throw new Error('eclipseExport.begin() selhal.');

const shot = () => page.screenshot(
  CFG.codec === 'png' ? { type: 'png' } : { type: 'jpeg', quality: CFG.quality });

/* ---------- režim náhledu: jen pár PNG ke kontrole ---------- */
if (CFG.probe) {
  for (let i = 0; i < CFG.probe; i++) {
    const ms = CFG.start + (CFG.end - CFG.start) * (CFG.probe === 1 ? 0 : i / (CFG.probe - 1));
    await page.evaluate(t => window.eclipseExport.frame(t), ms);
    const f = path.join(CFG.out, `probe-${String(i).padStart(2, '0')}.png`);
    fs.writeFileSync(f, await page.screenshot({ type: 'png' }));
    console.log(`${f}  ←  ${new Date(ms).toISOString()}`);
  }
  await browser.close();
  process.exit(0);
}

/* ---------- render ---------- */
const started = Date.now();
let done = 0;

for (let c = 0; c < chunks; c++) {
  const from = c * perChunk;
  const to   = Math.min(totalFrames, from + perChunk);
  const file = path.join(CFG.out, `zatmeni-${String(c + 1).padStart(2, '0')}.mp4`);

  const ff = spawn('ffmpeg', [
    '-y', '-hide_banner', '-loglevel', 'error',
    '-f', 'image2pipe', '-vcodec', CFG.codec === 'png' ? 'png' : 'mjpeg',
    '-framerate', String(CFG.fps), '-i', 'pipe:0',
    '-c:v', 'libx264', '-preset', CFG.preset, '-crf', String(CFG.crf),
    '-pix_fmt', 'yuv420p', '-r', String(CFG.fps),
    '-movflags', '+faststart', file,
  ], { stdio: ['pipe', 'inherit', 'inherit'] });
  const ffDone = once(ff, 'close');

  for (let i = from; i < to; i++) {
    const ms = CFG.start + (i / CFG.fps) * 1000 * CFG.speed;
    await page.evaluate(t => window.eclipseExport.frame(t), ms);
    const buf = await shot();
    if (!ff.stdin.write(buf)) await once(ff.stdin, 'drain');

    if (++done % 50 === 0 || i === to - 1) {
      const el = (Date.now() - started) / 1000;
      const eta = el / done * (totalFrames - done);
      process.stdout.write(
        `\r[${String(c + 1).padStart(2, '0')}/${chunks}] ` +
        `${done}/${totalFrames} · ${(done / el).toFixed(1)} sn/s · ` +
        `zbývá ${hhmmss(eta)} · ${new Date(ms).toISOString().substr(11, 8)} UTC     `);
    }
  }

  ff.stdin.end();
  const [code] = await ffDone;
  if (code !== 0) throw new Error(`ffmpeg skončil s kódem ${code}`);
  console.log(`\n  → ${file}`);
}

await page.evaluate(() => window.eclipseExport.end());
await browser.close();

console.log(`\nHotovo za ${hhmmss((Date.now() - started) / 1000)}.`);
if (chunks > 1) {
  const list = path.join(CFG.out, 'seznam.txt');
  fs.writeFileSync(list, Array.from({ length: chunks },
    (_, i) => `file 'zatmeni-${String(i + 1).padStart(2, '0')}.mp4'`).join('\n') + '\n');
  console.log(`Spojení do jednoho souboru:\n  ffmpeg -f concat -safe 0 -i ${list} -c copy ${path.join(CFG.out, 'zatmeni-cele.mp4')}`);
}
