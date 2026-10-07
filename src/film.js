// 人间清又凉 — one pencil line that is a pipa string.
// Every frame is a pure function of its frame number: renderFrame(n).
import { clamp, smoothstep, keyed, ease, rgba } from './lib/util.js';
import { makeCanvas, makePaper, makeTooth, makeGrain } from './lib/draw.js';
import { W, H, FPS, FRAMES, C, CUE, S, M, setM, apply, inv, mul } from './core.js';
import { camera } from './camera.js';
import { TEXT, FS, buildOpening, drawPipa, drawStrings, drawOpeningText, drawHeroDrop } from './scenes/opening.js';
import { buildTown, drawRain, drawRainSky, drawTown, drawWalker } from './scenes/town.js';
import { buildLines, drawLines, flash, setCamLocal, P } from './scenes/lines.js';
import { buildRiver, drawRiverWashes, drawRidge, drawMoon, drawBoat, drawStorm, drawGeese, drawReeds, drawSun, drawFloatingLeaves, drawMist, drawHorizonString, moonPos, clearR } from './scenes/river.js';
import { buildFinale, drawFinaleText } from './scenes/finale.js';
import { buildGlyphs } from './glyphs.js';

export { FRAMES };
let ctx;

export async function init(canvas) {
  ctx = canvas.getContext('2d');
  S.ctx = ctx;
  const font = new FontFace('MSZ', 'url(../assets/fonts/MaShanZheng-subset.ttf)');
  await font.load();
  document.fonts.add(font);
  S.AUDIO = await (await fetch('./data/audio.json')).json();
  for (const k of ['wash', 'line', 'text', 'hi', 'blur']) {
    const c = makeCanvas(W, H);
    c.ctx = c.getContext('2d');
    S.L[k] = c;
  }
  S.TX.paper = makePaper(1024);
  S.TX.tooth = makeTooth(512, 0.42, 3);
  S.TX.toothSoft = makeTooth(512, 0.3, 9);
  S.TX.gran = makeTooth(512, 0.5, 21);
  S.TX.grain = [0, 1, 2, 3].map((i) => makeGrain(W, H, 100 + i));
  for (const k of ['paper', 'tooth', 'toothSoft', 'gran']) S.PAT[k] = ctx.createPattern(S.TX[k], 'repeat');
  S.GLYPHS = buildGlyphs(TEXT, FS);
  buildOpening(S.AUDIO);
  buildTown();
  setCamLocal((tt) => { const c = camera(tt); return { u: c.y - P[1], v: P[0] - c.x }; });
  buildLines();
  buildRiver();
  buildFinale();
}

// overall light of each passage (multiplied over the page)
function ambient(t) {
  return keyed([
    [0, [255, 252, 246]],
    [6.5, [252, 250, 246]],
    [9.5, [230, 234, 238], ease.sineInOut],
    [14, [230, 235, 238]],
    [17, [236, 244, 238]], // bamboo: green-cool light
    [26.5, [238, 243, 236]],
    [30, [250, 240, 228]], // dusk
    [36, [236, 236, 240]],
    [42, [214, 222, 236]], // moonlit night
    [46, [204, 212, 230]], // storm
    [59.7, [196, 204, 224]],
    [61.0, [250, 251, 250], ease.cubicOut], // cleared
    [69.6, [252, 251, 248]],
  ], t);
}

export function renderFrame(f) {
  const t = f / FPS;
  const t2 = (Math.floor(f / 2) * 2) / FPS; // drawn elements animate on twos
  const boil = Math.floor(f / 2); // line boil re-seeds every 2 frames
  const cam = camera(t);
  const camM = M(cam);
  const { L } = S;
  for (const k of ['wash', 'line', 'text', 'hi']) {
    const g = L[k].ctx;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.globalCompositeOperation = 'source-over';
    g.globalAlpha = 1;
    g.clearRect(0, 0, W, H);
  }
  const wg = L.wash.ctx, lg = L.line.ctx, tg = L.text.ctx;

  // ---- scenes (back to front within each layer)
  const hg = L.hi.ctx;
  drawRainSky(wg, cam, t, t2, boil);
  drawRiverWashes(wg, cam, t, t2, boil);
  drawSun(lg, wg, cam, t, t2, boil);
  drawRidge(lg, wg, cam, t, t2, boil);
  drawMist(wg, cam, t, t2, boil);
  drawPipa(lg, wg, cam, t, t2, boil);
  drawTown(lg, wg, cam, t, t2, boil);
  drawWalker(lg, wg, cam, t, t2, boil);
  drawRain(lg, cam, t, t2, boil);
  const [mu, mv] = t > 40 ? moonPos(cam) : [0, 0];
  drawLines(lg, wg, cam, t, t2, boil, { mu, mv, cr: clearR(t) });
  drawMoon(lg, wg, hg, cam, t, t2, boil);
  drawGeese(lg, cam, t, t2, boil);
  drawFloatingLeaves(lg, cam, t, t2, boil);
  drawBoat(lg, wg, cam, t, t2, boil);
  drawStorm(lg, wg, hg, cam, t, t2, boil);
  drawReeds(lg, wg, cam, t, t2, boil);
  drawHorizonString(lg, cam, t, t2, boil);
  drawStrings(lg, cam, t, t2, boil);
  drawOpeningText(tg, cam, t, t2, boil);
  drawFinaleText(tg, cam, t, t2, boil);
  drawHeroDrop(tg, cam, camera(t - 1 / FPS), t, t2, boil);

  composite(t, cam, camM, boil);
}

function composite(t, cam, camM, boil) {
  const { L, PAT, TX } = S;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = 1;
  // paper, fixed to the world
  const iv = inv(camM);
  const cs = [[0, 0], [W, 0], [0, H], [W, H]].map(([x, y]) => apply(iv, x, y));
  const bx0 = Math.min(...cs.map((c) => c[0])) - 8, by0 = Math.min(...cs.map((c) => c[1])) - 8;
  const bw = Math.max(...cs.map((c) => c[0])) - bx0 + 16, bh = Math.max(...cs.map((c) => c[1])) - by0 + 16;
  setM(ctx, camM);
  ctx.fillStyle = PAT.paper;
  ctx.fillRect(bx0, by0, bw, bh);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  // pigment skips over the paper tooth
  const tooth = (g, pat, a) => {
    g.save();
    setM(g, camM);
    g.globalCompositeOperation = 'destination-out';
    g.globalAlpha = a;
    g.fillStyle = pat;
    g.fillRect(bx0, by0, bw, bh);
    g.restore();
  };
  tooth(L.wash.ctx, PAT.gran, 0.17);
  tooth(L.line.ctx, PAT.tooth, 0.5);
  tooth(L.text.ctx, PAT.toothSoft, 0.35);
  ctx.globalCompositeOperation = 'multiply';
  ctx.drawImage(L.wash, 0, 0);
  ctx.drawImage(L.line, 0, 0);
  ctx.globalCompositeOperation = 'source-over';
  ctx.drawImage(L.hi, 0, 0);
  // light of the passage
  ctx.globalCompositeOperation = 'multiply';
  const fl = flash(t);
  const amb = ambient(t).map((c) => c + (255 - c) * fl * 0.85);
  ctx.fillStyle = rgba(amb);
  ctx.fillRect(0, 0, W, H);
  ctx.globalCompositeOperation = 'source-over';
  motionBlur(t, camM);
  // the poem layer carries its own smears, so it is laid on after the camera blur
  ctx.globalCompositeOperation = 'multiply';
  ctx.drawImage(L.text, 0, 0);
  ctx.globalCompositeOperation = 'source-over';
  // vignette + grain
  const vg = ctx.createRadialGradient(W / 2, H * 0.48, H * 0.3, W / 2, H / 2, H * 0.8);
  vg.addColorStop(0, 'rgba(255,255,255,1)');
  vg.addColorStop(1, 'rgba(208,200,186,1)');
  ctx.globalCompositeOperation = 'multiply';
  ctx.fillStyle = vg;
  ctx.fillRect(0, 0, W, H);
  ctx.globalCompositeOperation = 'soft-light';
  ctx.globalAlpha = 0.16;
  ctx.drawImage(TX.grain[boil % 4], 0, 0);
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
}

// camera motion blur: re-project the finished frame along the camera path over a 180° shutter
function motionBlur(t, camM) {
  const dt = 1 / FPS / 2;
  const ivc = inv(camM);
  const mA = M(camera(t - dt / 2)), mB = M(camera(t + dt / 2));
  let maxd = 0;
  for (const [sx, sy] of [[0, 0], [W, 0], [0, H], [W, H], [W / 2, H / 2]]) {
    const [wx, wy] = apply(ivc, sx, sy);
    const [ax, ay] = apply(mA, wx, wy), [bx, by] = apply(mB, wx, wy);
    maxd = Math.max(maxd, Math.hypot(bx - ax, by - ay));
  }
  if (maxd < 2) return;
  const n = Math.min(12, Math.ceil(maxd / 2));
  const b = S.L.blur.ctx;
  b.setTransform(1, 0, 0, 1, 0, 0);
  b.globalCompositeOperation = 'copy';
  b.drawImage(ctx.canvas, 0, 0);
  ctx.globalCompositeOperation = 'source-over';
  for (let k = 0; k < n; k++) {
    const u = n === 1 ? 0.5 : k / (n - 1);
    const T = mul(M(camera(t - dt / 2 + u * dt)), ivc);
    ctx.setTransform(T[0], T[1], T[2], T[3], T[4], T[5]);
    ctx.globalAlpha = 1 / (k + 2);
    ctx.drawImage(S.L.blur, 0, 0);
  }
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1;
}
