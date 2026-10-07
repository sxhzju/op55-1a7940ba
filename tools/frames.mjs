// Review tool: render chosen frames to PNG and tile them into a strip.
//   node tools/frames.mjs --name t1 --frames 0,6,12        explicit frames
//   node tools/frames.mjs --name t1 --from 180 --to 240 --step 3
//   node tools/frames.mjs --name all --every 15             one frame every 0.5 s
// Output goes to out/review/ (git-ignored).
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { ROOT, startServer, launch, openPage, grab } from './browser.mjs';

const args = Object.fromEntries(process.argv.slice(2).reduce((a, v, i, arr) => {
  if (v.startsWith('--')) a.push([v.slice(2), arr[i + 1] && !arr[i + 1].startsWith('--') ? arr[i + 1] : true]);
  return a;
}, []));
const name = args.name || 'review';
const outDir = path.join(ROOT, 'out', 'review', name);
fs.rmSync(outDir, { recursive: true, force: true });
fs.mkdirSync(outDir, { recursive: true });

const srv = await startServer();
const browser = await launch();
const page = await openPage(browser, srv.address().port);
const total = await page.evaluate(() => window.FRAMES);
let frames;
if (args.frames) frames = String(args.frames).split(',').map(Number);
else if (args.every) frames = Array.from({ length: Math.ceil(total / +args.every) }, (_, i) => i * +args.every);
else {
  const step = +(args.step || 3);
  frames = [];
  for (let f = +(args.from || 0); f <= +(args.to || total - 1); f += step) frames.push(f);
}
const t0 = Date.now();
for (let i = 0; i < frames.length; i++) {
  const buf = await grab(page, frames[i]);
  fs.writeFileSync(path.join(outDir, `${String(i).padStart(4, '0')}_f${frames[i]}.png`), buf);
}
console.log(`rendered ${frames.length} frames in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
await browser.close();
srv.close();

const cols = +(args.cols || Math.min(frames.length, 6));
const tw = +(args.tw || 270);
const rows = Math.ceil(frames.length / cols);
const list = fs.readdirSync(outDir).filter((f) => f.endsWith('.png')).sort();
// tile with frame labels
const tmp = path.join(outDir, 'seq');
fs.mkdirSync(tmp);
list.forEach((f, i) => fs.copyFileSync(path.join(outDir, f), path.join(tmp, `${String(i).padStart(4, '0')}.png`)));
const labels = frames.map((f) => `${f} ${(f / 30).toFixed(2)}s`);
fs.writeFileSync(path.join(tmp, 'labels.txt'), labels.join('\n'));
const vf = `scale=${tw}:-1,drawtext=text='%{eif\\:n\\:d}':x=6:y=6:fontsize=16:fontcolor=red:box=1:boxcolor=white@0.7,tile=${cols}x${rows}:padding=4:color=black`;
execFileSync('ffmpeg', ['-loglevel', 'error', '-y', '-framerate', '1', '-i', path.join(tmp, '%04d.png'), '-vf', vf, '-frames:v', '1', path.join(ROOT, 'out', 'review', `${name}.png`)]);
fs.rmSync(tmp, { recursive: true, force: true });
console.log('strip:', path.join(ROOT, 'out', 'review', `${name}.png`), 'frames:', frames.join(','));
