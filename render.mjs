// Render the film: headless Chrome draws each frame (a pure function of the frame number),
// PNGs are streamed into FFmpeg, then the original audio is muxed in untouched from t = 0.
//
//   node render.mjs                      full film -> op55-hd.mp4
//   node render.mjs --workers 6          parallel pages (default 4)
//   node render.mjs --from 0 --to 299    partial render (for tests) -> out/partial.mp4
//
// Needs: Node 18+, FFmpeg on PATH, Google Chrome (or set CHROME_PATH).
import fs from 'node:fs';
import path from 'node:path';
import { spawn, execFileSync } from 'node:child_process';
import { ROOT, startServer, launch, openPage, grab } from './tools/browser.mjs';

const args = Object.fromEntries(process.argv.slice(2).reduce((a, v, i, arr) => {
  if (v.startsWith('--')) a.push([v.slice(2), arr[i + 1] && !arr[i + 1].startsWith('--') ? arr[i + 1] : true]);
  return a;
}, []));
const WORKERS = +(args.workers || 4);
const CRF = String(args.crf || 18);
const AUDIO = path.join(ROOT, 'original.m4a');
const segDir = path.join(ROOT, 'out', 'segments');
fs.rmSync(segDir, { recursive: true, force: true });
fs.mkdirSync(segDir, { recursive: true });

const srv = await startServer();
const port = srv.address().port;
const browser = await launch();
const probe = await openPage(browser, port);
const TOTAL = await probe.evaluate(() => window.FRAMES);
await probe.close();
const from = +(args.from ?? 0), to = Math.min(TOTAL - 1, +(args.to ?? TOTAL - 1));
const partial = args.from !== undefined || args.to !== undefined;
const OUT = path.join(ROOT, partial ? 'out/partial.mp4' : (args.out || 'op55-hd.mp4'));
const count = to - from + 1;
console.log(`frames ${from}..${to} (${count}) with ${WORKERS} workers`);

function encoder(file) {
  const ff = spawn('ffmpeg', ['-loglevel', 'error', '-y', '-f', 'image2pipe', '-framerate', '30', '-c:v', 'png', '-i', '-',
    '-c:v', 'libx264', '-preset', 'slow', '-crf', CRF, '-pix_fmt', 'yuv420p', '-r', '30', '-g', '60', file], { stdio: ['pipe', 'inherit', 'inherit'] });
  const done = new Promise((res, rej) => ff.on('close', (c) => (c === 0 ? res() : rej(new Error('ffmpeg exited ' + c)))));
  return { ff, done };
}

const chunk = Math.ceil(count / WORKERS);
let rendered = 0;
const t0 = Date.now();
const jobs = [];
for (let w = 0; w < WORKERS; w++) {
  const a = from + w * chunk, b = Math.min(to, a + chunk - 1);
  if (a > b) break;
  const file = path.join(segDir, `seg_${String(w).padStart(2, '0')}.mp4`);
  jobs.push((async () => {
    const page = await openPage(browser, port);
    const { ff, done } = encoder(file);
    for (let f = a; f <= b; f++) {
      const buf = await grab(page, f);
      if (!ff.stdin.write(buf)) await new Promise((r) => ff.stdin.once('drain', r));
      rendered++;
      if (rendered % 60 === 0) {
        const el = (Date.now() - t0) / 1000;
        console.log(`  ${rendered}/${count}  ${(rendered / el).toFixed(1)} fps  eta ${((count - rendered) / (rendered / el)).toFixed(0)}s`);
      }
    }
    ff.stdin.end();
    await done;
    await page.close();
    return file;
  })());
}
const files = await Promise.all(jobs);
await browser.close();
srv.close();

// join segments, then mux the original audio (stream copy: no re-encode, starts at 0, full length)
const list = path.join(segDir, 'list.txt');
fs.writeFileSync(list, files.map((f) => `file '${f}'`).join('\n'));
const video = path.join(segDir, 'video.mp4');
execFileSync('ffmpeg', ['-loglevel', 'error', '-y', '-f', 'concat', '-safe', '0', '-i', list, '-c', 'copy', video]);
const mux = ['-loglevel', 'error', '-y', '-i', video];
if (!partial || from === 0) mux.push('-i', AUDIO, '-map', '0:v:0', '-map', '1:a:0', '-c:a', 'copy');
else mux.push('-map', '0:v:0');
mux.push('-c:v', 'copy', '-movflags', '+faststart', OUT);
execFileSync('ffmpeg', mux);
console.log(`done in ${((Date.now() - t0) / 1000).toFixed(0)}s -> ${OUT}`);
