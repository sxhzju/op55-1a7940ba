// 63.6 - 69.6 s: silence. The poem is written again beside the moon, a seal is pressed on the click,
// the last string twitches once, and the page holds.
import { clamp, lerp, smoothstep, ease, curve, noise1, rng, TAU, rgba, bezier } from '../lib/util.js';
import { makeCanvas, blobPath, fillPts } from '../lib/draw.js';
import { C, CUE, S, M, setM, W, H, inv, apply } from '../core.js';
import { LM, P } from './lines.js';
import { camera } from '../camera.js';
import { buildGlyphs } from '../glyphs.js';
import { TEXT } from './opening.js';

const FS2 = 100, CELL2 = 112;
let G2 = [], SEAL = null, TMP = null, ANCHOR = null;
export const WRITE = { t0: 63.72, gap: 0.27, dur: 0.42 };

export function buildFinale() {
  G2 = buildGlyphs(TEXT, FS2);
  TMP = makeCanvas(G2[0].S, G2[0].S);
  TMP.g = TMP.getContext('2d');
  // anchor: a fixed spot on the paper, chosen so the column sits right of centre in the final frame
  const c = camera(67);
  const m = LM(c, 1);
  const iv = inv(m);
  ANCHOR = apply(iv, 812, 150); // local coords of the column top at screen (805,168)
  // seal: vermilion square with 清凉 cut out in white
  const s = 92;
  SEAL = makeCanvas(s * 2, s * 2);
  const g = SEAL.getContext('2d');
  g.translate(s, s);
  const pts = blobPath(0, 0, s * 0.5, s * 0.5, 31, 0, 0.05, 40, 0);
  // squarish: push the blob toward a square
  const sq = pts.map(([x, y]) => { const k = Math.max(Math.abs(x), Math.abs(y)) / (s * 0.5); return [x / Math.pow(k, 0.85), y / Math.pow(k, 0.85)]; });
  fillPts(g, sq);
  g.fillStyle = rgba(C.vermilion, 0.95);
  g.fill();
  g.globalCompositeOperation = 'destination-out';
  g.fillStyle = '#000';
  g.font = `${Math.round(s * 0.42)}px MSZ`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText('清', 0, -s * 0.2);
  g.fillText('凉', 0, s * 0.22);
  // worn stamp texture
  const R = rng(55);
  for (let i = 0; i < 260; i++) {
    g.beginPath();
    g.arc((R() - 0.5) * s * 1.05, (R() - 0.5) * s * 1.05, R() * 2.2, 0, TAU);
    g.fill();
  }
  g.globalCompositeOperation = 'source-over';
}

export function drawFinaleText(tg, cam, t, t2, boil) {
  if (t < WRITE.t0 - 0.05) return;
  const m = LM(cam, 1);
  const T = TMP.g;
  for (let i = 0; i < G2.length; i++) {
    const G = G2[i];
    const t0 = WRITE.t0 + i * WRITE.gap;
    const p = bezier(0.25, 0.1, 0.2, 1)(clamp((t - t0) / WRITE.dur));
    if (p <= 0) continue;
    let x = ANCHOR[0], y = ANCHOR[1] + CELL2 * i + CELL2 / 2;
    if (G.ch === '，') { x += FS2 * 0.3; y = ANCHOR[1] + CELL2 * i + FS2 * 0.1; }
    // brush sweep: reveal along a slanted front (top-left -> bottom-right), soft edged
    T.setTransform(1, 0, 0, 1, 0, 0);
    T.globalCompositeOperation = 'copy';
    T.drawImage(G.c, 0, 0);
    T.globalCompositeOperation = 'destination-in';
    const S2 = G.S;
    const f = lerp(-0.35, 1.35, p);
    const gr = T.createLinearGradient(S2 * 0.15, S2 * 0.05, S2 * 0.85, S2 * 0.95);
    gr.addColorStop(clamp(f - 0.18), 'rgba(0,0,0,1)');
    gr.addColorStop(clamp(f), 'rgba(0,0,0,0)');
    if (f >= 1.17) { gr.addColorStop(0, 'rgba(0,0,0,1)'); }
    T.fillStyle = gr;
    T.fillRect(0, 0, S2, S2);
    T.globalCompositeOperation = 'source-over';
    setM(tg, m);
    tg.translate(x, y);
    const land = ease.backOut(clamp((t - t0) / 0.5), 1.4);
    const sc = lerp(1.06, 1, land);
    tg.scale(sc, sc);
    const wet = 1 - smoothstep(t0, t0 + 1.8, t);
    tg.globalAlpha = (0.12 + 0.3 * wet) * p;
    tg.drawImage(G.b, -G.cx - 2, -G.cy - 2, G.S + 4, G.S + 4);
    tg.globalAlpha = 1;
    tg.drawImage(TMP, -G.cx, -G.cy);
  }
  tg.setTransform(1, 0, 0, 1, 0, 0);
  // the seal, pressed on the click
  const k = t - CUE.click;
  if (k > -0.12) {
    setM(tg, m);
    const sx = ANCHOR[0] - 84, sy = ANCHOR[1] + CELL2 * 5.15;
    tg.translate(sx, sy);
    let sc, a;
    if (k < 0) { sc = 1.35 + k * -1; a = 0; }
    else { sc = 1 + 0.18 * Math.exp(-k * 9) * Math.cos(k * 26); a = clamp(k / 0.05); }
    tg.rotate(-0.04);
    tg.scale(sc, sc * (k >= 0 && k < 0.06 ? 0.92 : 1));
    tg.globalAlpha = a;
    tg.drawImage(SEAL, -SEAL.width / 2, -SEAL.height / 2);
    tg.globalAlpha = 1;
    tg.setTransform(1, 0, 0, 1, 0, 0);
  }
}
