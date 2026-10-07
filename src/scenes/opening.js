// 0 - 9.5 s: the poem rides a pipa string; the strings are plucked; the ink melts and falls as rain.
import { clamp, lerp, smoothstep, ease, curve, noise1, h01, rng, hash, TAU, rgba, prog, keyed } from '../lib/util.js';
import { resample, ribbon, pencil, wash, washPoly, fillPts, makeCanvas } from '../lib/draw.js';
import { C, CUE, S, M, setM } from '../core.js';
import { camera } from '../camera.js';

export const TEXT = ['人', '间', '清', '又', '凉', '，'];
export const FS = 168;

// ---------------------------------------------------------------- geometry of the (very close) pipa
export const STR_X = [-270, -120, 30, 180];
export const TEXT_STR = 3;
const AXIS = -45; // pipa centre line
const BRIDGE_Y = 560; // 覆手: strings end here
const NUT_Y = -1600; // where the left hand stops the strings (off screen)
export const PLUCK_Y = 400;
const SHOULDER_Y = -520;
const NECK_HW = 330;

export function stringX(s, y) {
  // strings fan out slightly from the neck towards the bridge
  return AXIS + (STR_X[s] - AXIS) * (1 + (y - BRIDGE_Y) / 7000);
}

// pipa body half-width at height y (neck above the shoulders, pear below)
function bodyHW(y) {
  if (y < SHOULDER_Y) return NECK_HW;
  const u = (y - SHOULDER_Y) / 1700;
  return NECK_HW + 620 * Math.pow(Math.sin(Math.min(1, u) * Math.PI * 0.5), 0.75) - (u > 1 ? (u - 1) * 0 : 0);
}
const BODY_BOT = 1500;
function bodyOutline(side) {
  const pts = [];
  for (let y = -2600; y <= BODY_BOT - 300; y += 20) pts.push([AXIS + side * bodyHW(y), y]);
  // round bottom
  const cy = BODY_BOT - 300, r = bodyHW(cy);
  for (let a = 0; a <= Math.PI / 2; a += 0.05) pts.push([AXIS + side * r * Math.cos(a), cy + Math.sin(a) * 300]);
  return pts;
}

// ---------------------------------------------------------------- plucks
export let PLUCKS = [];
export function buildOpening(AUDIO) {
  const named = [
    [1, CUE.pluck1, 1.0], [0, CUE.pluck2, 0.9], [2, CUE.pluck3, 0.95],
    [3, CUE.pluck4, 0.8], [1, CUE.pluck5, 0.8], [3, 4.923, 0.5],
    [2, 3.785, 0.55], [0, 4.156, 0.6], [1, 4.319, 0.45], [2, 5.271, 0.6], [1, 5.457, 0.55], [0, 5.689, 0.5],
  ];
  PLUCKS = named.map(([s, t, a]) => ({ s, t, a }));
  for (const [t, a] of AUDIO.onsets) {
    if (t < 1.2 || t > 6.0 || a < 0.25) continue;
    if (named.some((n) => Math.abs(n[1] - t) < 0.08)) continue;
    PLUCKS.push({ s: hash(t * 1000) % 3, t, a: a * 0.35 });
  }
  // the big release: string 3 is drawn aside from 5.75 s and let go on the melt cue
  PLUCKS.push({ s: 3, t: CUE.melt, a: 2.2, pull: 0.55 });
  PLUCKS.push({ s: 3, t: CUE.melt2, a: 1.3 });
  for (let s = 0; s < 3; s++) PLUCKS.push({ s, t: CUE.melt + 0.045 * (3 - s), a: 1.0 });
  PLUCKS.push({ s: 0, t: CUE.melt2 + 0.05, a: 0.8 }, { s: 2, t: CUE.melt2 + 0.09, a: 0.7 });
  buildDrips();
}

// standing-wave shape between bridge and stopping finger
const modeShape = (y) => Math.sin(Math.PI * clamp((BRIDGE_Y - y) / (BRIDGE_Y - NUT_Y)));

export function stringDisp(s, y, t) {
  let d = 0;
  const shape = modeShape(y);
  for (const p of PLUCKS) {
    if (p.s !== s) continue;
    const tau = t - p.t;
    const pull = p.pull || 0.1;
    if (tau < -pull || tau > 3) continue;
    const A = p.a * 24;
    if (tau < 0) {
      // anticipation: the string is drawn aside before release (triangle from the pluck point)
      const u = (tau + pull) / pull;
      const k = p.pull ? ease.sineInOut(u) : ease.cubicIn(u);
      const tri = y > PLUCK_Y ? clamp((BRIDGE_Y - y) / (BRIDGE_Y - PLUCK_Y)) : clamp((y - NUT_Y) / (PLUCK_Y - NUT_Y));
      d -= A * (p.pull ? 2.6 : 1.6) * k * tri;
      continue;
    }
    // fundamental + 2nd partial, visible as a slow wobble (the drawing is on twos)
    d += A * shape * Math.exp(-tau / 0.5) * Math.cos(TAU * 6.2 * tau);
    d += A * 0.35 * Math.sin(2 * Math.PI * clamp((BRIDGE_Y - y) / (BRIDGE_Y - NUT_Y))) * Math.exp(-tau / 0.3) * Math.cos(TAU * 11.7 * tau + 1);
    // a pulse running up the string from the pluck point
    const u = (PLUCK_Y - y) - 2600 * tau;
    d += A * 0.5 * Math.exp(-tau / 0.6) * Math.exp(-(u * u) / (2 * 150 * 150)) * Math.cos(u / 60) * shape;
  }
  return d;
}

function stringEnv(s, y, t) {
  let e = 0;
  const shape = modeShape(y);
  for (const p of PLUCKS) {
    if (p.s !== s) continue;
    const tau = t - p.t;
    if (tau < 0 || tau > 2) continue;
    e += p.a * 28 * shape * Math.exp(-tau / 0.32);
  }
  return e;
}

// ---------------------------------------------------------------- pipa body (wash + pencil construction)
export function drawPipa(lg, wg, cam, t, t2, boil) {
  if (t > 10.5) return;
  const m = M(cam);
  setM(lg, m);
  setM(wg, m);
  // runs: after the release the wet wash slides down the page
  const run = ease.cubicIn(clamp((t - CUE.melt2) / 2.6));
  const fade = 1 - smoothstep(7.2, 8.4, t);
  // wash blooms outward from under the poem at frame 0, clipped by the body of the instrument
  const bloom = ease.expoOut(clamp((t + 0.06) / 2.6));
  {
    const pts = [];
    const Lo = bodyOutline(-1), Ro = bodyOutline(1);
    for (const p of Lo) pts.push(p);
    for (let i = Ro.length - 1; i >= 0; i--) pts.push(Ro[i]);
    const q = pts.map(([x, y], i) => {
      const drip = run * (120 + 900 * Math.pow(h01(Math.floor(i / 3), 5), 4)) * smoothstep(-400, 1400, y);
      return [x, y + drip];
    });
    wg.save();
    fillPts(wg, q);
    wg.clip();
    const R0 = lerp(120, 2700, bloom);
    const cy = 40 + run * 500;
    // first pass: pale celadon, blooming out from under the poem
    wash(wg, 150, cy, R0 * 0.85, R0 * (1 + run * 0.6), { color: C.celadon, alpha: 0.24 * fade, layers: 4, seed: 41, boil: Math.floor(boil / 4), rough: 0.25, edge: 0.45, edgeW: 5, edgeColor: C.celadonDeep });
    // pigment pooling toward the edges of the body (cooler, darker), leaving the centre as lit paper
    if (bloom > 0.3) {
      wg.lineWidth = 140;
      wg.filter = 'blur(28px)';
      fillPts(wg, q);
      wg.strokeStyle = rgba(C.indigoWash, 0.32 * fade * smoothstep(0.3, 0.9, bloom));
      wg.stroke();
      wg.filter = 'none';
    }
    // a second, smaller glaze lower down: where the hand plucks
    wash(wg, -40, 520 + run * 500, R0 * 0.32, R0 * 0.22 * (1 + run), { color: C.indigoWash, alpha: 0.13 * fade, layers: 3, seed: 43, boil: Math.floor(boil / 4), rough: 0.35, edge: 0.4 });
    wg.restore();
    // wet edge where the wash has reached the outline
    fillPts(wg, q);
    wg.strokeStyle = rgba(C.celadonDeep, 0.3 * fade * smoothstep(0.55, 0.95, bloom));
    wg.lineWidth = 3;
    wg.stroke();
  }
  // pencil outline of the shoulders, traced on beats 1.28 / 1.70
  for (const [side, t0] of [[-1, 1.18], [1, 1.6]]) {
    const p = curve.stroke(clamp((t2 - t0) / 0.7));
    if (p <= 0) continue;
    const pts = bodyOutline(side).filter(([, y]) => y > -1300).map(([x, y]) => [x, y + run * 300 * smoothstep(-200, 1400, y)]);
    // draw from the shoulder outwards in both directions
    const iS = pts.findIndex(([, y]) => y >= SHOULDER_Y);
    const up = pts.slice(0, iS + 1).reverse(), down = pts.slice(iS);
    pencil(lg, up, { w: 2.4, color: C.pencil, alpha: 0.7 * fade, from: 0, to: p, seed: 60 + side, boil, wob: 1.6, taper: [6, 80] });
    pencil(lg, down, { w: 2.8, color: C.pencil, alpha: 0.75 * fade, from: 0, to: p, seed: 62 + side, boil, wob: 1.6, taper: [6, 120] });
    // shading: quick diagonal hatching inside the curve of the body, following the pen
    const hp = clamp((t2 - t0 - 0.35) / 0.9);
    if (hp > 0) {
      const R = rng(70 + side);
      for (let i = 0; i < down.length - 1; i += 2) {
        const f = i / down.length;
        if (f > hp) break;
        const [x, y] = down[i];
        const len = (26 + R() * 30) * (1 - f * 0.4);
        const a = (0.35 + R() * 0.25) * fade * clamp((hp - f) * 6);
        ribbon(lg, [[x - side * 4, y], [x - side * (4 + len * 0.7), y + len * 0.7]], { w: 1.5, color: C.pencil, alpha: a, seed: 80 + i + side, boil, wob: 0.4, taper: [3, 6], pressure: 0, step: 4 });
      }
    }
  }
  // wood grain on the face: long faint pencil lines, laid in on the off-beats
  for (let k = 0; k < 7; k++) {
    const t0 = 3.55 + k * 0.21;
    const p = curve.stroke(clamp((t2 - t0) / 0.6));
    if (p <= 0) continue;
    const x0 = AXIS - 520 + k * 150 + (k % 2) * 40;
    const pts = [];
    for (let y = -420; y <= 1300; y += 30) pts.push([x0 + Math.sin(y / 260 + k) * 18 + (x0 - AXIS) * (y + 500) / 2400, y + run * 300 * smoothstep(-200, 1400, y)]);
    pencil(lg, pts, { w: 1.3, color: C.pencil, alpha: 0.28 * fade, from: 0, to: p, seed: 140 + k, boil, wob: 2, taper: [60, 60], pressure: 0, double: false });
  }
  // frets (相) on the neck at the top, beat 2.11
  for (const [k, fy] of [[0, -700], [1, -930]]) {
    const p = curve.stroke(clamp((t2 - 2.05 - k * 0.12) / 0.45));
    if (p <= 0) continue;
    const hw = NECK_HW - 12;
    const y = fy + run * 200;
    washPoly(wg, [[AXIS - hw, y - 16], [AXIS + hw, y - 16], [AXIS + hw, y + 18], [AXIS - hw, y + 18]].map(([x, yy]) => [AXIS + (x - AXIS) * p, yy]),
      { color: C.wood, alpha: 0.5 * fade, layers: 2, jit: 2, seed: 80 + k });
    pencil(lg, [[AXIS - hw, y - 16], [AXIS + hw, y - 18], [AXIS + hw + 4, y + 16], [AXIS - hw, y + 18], [AXIS - hw, y - 14]],
      { w: 2.0, color: C.ink, alpha: 0.65 * fade, from: 0, to: p, seed: 90 + k, boil, wob: 1, taper: [4, 4] });
  }
  // bridge (覆手): one fat brush stroke with curled ends, on beat 3.37
  {
    const p = curve.stroke(clamp((t2 - 3.3) / 0.55));
    if (p > 0) {
      const y = BRIDGE_Y + run * 420;
      const pts = [];
      const x0 = AXIS - 330, x1 = AXIS + 320;
      for (let a = Math.PI * 1.1; a > 0; a -= 0.25) pts.push([x0 + 26 + Math.cos(a) * 26, y - 6 + Math.sin(a) * 22]);
      for (let x = x0 + 26; x <= x1 - 26; x += 20) pts.push([x, y + 10 + Math.sin((x - x0) / 120) * 3]);
      for (let a = Math.PI; a < Math.PI * 2.1; a += 0.25) pts.push([x1 - 26 - Math.cos(a) * 26, y - 6 - Math.sin(a) * 22]);
      ribbon(lg, pts, { w: 22, color: C.ink, alpha: 0.9 * fade, from: 0, to: p, seed: 120, boil, wob: 1.2, taper: [30, 40], pressure: 0.35 });
      washPoly(wg, [[x0 + 20, y - 26], [x1 - 20, y - 26], [x1 - 30, y + 30], [x0 + 30, y + 30]].map(([x, yy]) => [lerp(x0, x, p), yy]),
        { color: C.ink, alpha: 0.18 * fade, layers: 2, jit: 4, seed: 121 });
    }
  }
}

// ---------------------------------------------------------------- strings
const STR_DRAW = [CUE.pluck2 - 0.22, CUE.pluck1 - 0.22, CUE.pluck3 - 0.22, -0.3];
const STR_W = [5.2, 4.0, 3.0, 2.4]; // 缠弦 .. 子弦

export function drawStrings(g, cam, t, t2, boil) {
  if (t > 10.5) return;
  setM(g, M(cam));
  for (let s = 0; s < 4; s++) {
    const dp = curve.stroke(clamp((t - STR_DRAW[s]) / 0.38));
    if (dp <= 0) continue;
    const dis = prog(t, 6.7 + s * 0.07, 9.0, ease.cubicIn);
    const w = STR_W[s];
    const alpha = 0.92;
    if (dis <= 0) {
      const pts = [];
      for (let y = -2600; y <= BRIDGE_Y; y += 14) pts.push([stringX(s, y) + stringDisp(s, y, t2), y]);
      pencil(g, pts, { w, color: C.graphite, alpha, from: 0, to: dp, seed: 10 + s, boil, wob: 1.2, taper: [30, 4], pressure: 0.1 });
    } else {
      // the string breaks into dashes that fall: the first rain
      const R = rng(500 + s);
      let y = -2600;
      while (y < BRIDGE_Y) {
        const len = 50 + R() * 150;
        const gap = 4 + R() * 24 + dis * (80 + R() * 300);
        const fallT = Math.max(0, t2 - 6.75 - R() * 0.5);
        const drop = 0.5 * 1900 * fallT * fallT * (0.6 + R() * 0.8);
        const y0 = y + drop, y1 = y + len * (1 - dis * 0.6) + drop * 1.06;
        const sub = [];
        for (let yy = y0; yy <= y1; yy += 10) sub.push([stringX(s, Math.min(yy, BRIDGE_Y)) + stringDisp(s, yy - drop, t2), yy]);
        if (sub.length > 1) pencil(g, sub, { w: w * (1 - dis * 0.45), color: C.graphite, alpha: alpha * (1 - dis * 0.3), seed: 10 + s + y, boil, wob: 1, taper: [12, 18] });
        y += len + gap;
      }
    }
    // vibration ghost: soft graphite lens either side
    const env = [];
    let any = false;
    for (let y = -1400; y <= BRIDGE_Y; y += 20) {
      const e = stringEnv(s, y, t2) * (1 - dis);
      if (e > 1.5) any = true;
      env.push([y, e]);
    }
    if (any && dp > 0.9) {
      g.beginPath();
      env.forEach(([y, e], i) => { const x = stringX(s, y) + e; i ? g.lineTo(x, y) : g.moveTo(x, y); });
      for (let i = env.length - 1; i >= 0; i--) { const [y, e] = env[i]; g.lineTo(stringX(s, y) - e, y); }
      g.closePath();
      g.fillStyle = rgba(C.graphite, 0.08);
      g.fill();
      for (const sg of [-1, 1]) {
        const gp = env.filter(([, e]) => e > 1).map(([y, e]) => [stringX(s, y) + sg * e * (0.8 + 0.2 * noise1(boil * 1.7, s + sg)), y]);
        if (gp.length > 2) ribbon(g, gp, { w: 1.3, color: C.graphite, alpha: 0.3, seed: 40 + s + sg, boil, wob: 2, taper: [60, 60] });
      }
    }
  }
  // twang marks beside the pluck point
  for (const p of PLUCKS) {
    const tau = t2 - p.t;
    if (tau < 0 || tau > 0.4 || p.a < 0.4) continue;
    const u = tau / 0.4;
    const x = stringX(p.s, PLUCK_Y);
    for (const sg of [-1, 1]) {
      for (let k = 0; k < 3; k++) {
        const off = 20 + k * 14 + ease.expoOut(u) * 34;
        const len = (40 - k * 11) * (1 - u * 0.4) * Math.min(1.3, p.a);
        const pts = [];
        for (let j = 0; j <= 6; j++) {
          const v = j / 6 - 0.5;
          pts.push([x + sg * (off + Math.cos(v * 2.4) * 7), PLUCK_Y + v * len * 2]);
        }
        ribbon(g, pts, { w: 2.4, color: C.ink, alpha: 0.8 * (1 - u), seed: 70 + k + sg, boil, wob: 0.8, taper: [8, 8] });
      }
    }
  }
}

// ---------------------------------------------------------------- the poem
const COL_X = STR_X[TEXT_STR];
const CELL = 176;
const COL_TOP = -600;
export function glyphPos(i) {
  // vertical writing: the comma sits top-right in its cell
  if (TEXT[i] === '，') return [stringX(TEXT_STR, COL_TOP + CELL * i) + FS * 0.3, COL_TOP + CELL * i + FS * 0.12];
  const y = COL_TOP + CELL * i + CELL / 2;
  return [stringX(TEXT_STR, y), y];
}

// drip sources: bottom ends of strokes, found from the glyph bitmaps
let DRIPS = [];
function buildDrips() {
  DRIPS = [];
  S.GLYPHS.forEach((G, gi) => {
    if (G.ch === '，') return;
    const d = G.c.getContext('2d').getImageData(0, 0, G.S, G.S).data;
    const cands = [];
    for (let x = G.x0 + 3; x < G.x1 - 3; x += 3) {
      // scan up from the bottom; take every place where an ink run ends (stroke bottom)
      let run = 0;
      for (let y = G.y0; y <= G.y1 + 1; y++) {
        const a = y <= G.y1 ? d[(y * G.S + x) * 4 + 3] : 0;
        if (a > 128) run++;
        else {
          if (run > 10) cands.push({ x, y: y - 2, run });
          run = 0;
        }
      }
    }
    const R = rng(1000 + gi);
    const pick = [];
    const n = 3 + Math.floor(R() * 3);
    for (let k = 0; k < n && cands.length; k++) {
      const c = cands.splice(Math.floor(R() * cands.length), 1)[0];
      if (pick.some((p) => Math.abs(p.x - c.x) < 26)) { k -= 0.5; continue; }
      pick.push(c);
    }
    for (const c of pick) {
      DRIPS.push({
        gi, lx: c.x - G.cx, ly: c.y - G.cy, w: 4 + Math.pow(R(), 2) * 9 + Math.min(3, c.run / 25),
        t0: CUE.melt + 0.06 + (5 - gi) * 0.045 + R() * 0.35, hang: 0.45 + R() * 0.7, Lmax: 26 + Math.pow(R(), 1.5) * 170,
        seed: gi * 100 + DRIPS.length,
      });
    }
  });
}

function glyphState(i, t, t2) {
  const [x, y] = glyphPos(i);
  const dx = stringDisp(TEXT_STR, y, t2);
  const slope = (stringDisp(TEXT_STR, y + 20, t2) - stringDisp(TEXT_STR, y - 20, t2)) / 40;
  const land = ease.expoOut(clamp((t + 0.28 - i * 0.025) / 0.9));
  const sc = lerp(1.08, 1, land);
  // after the release the glyph slides down with its ink, slowly at first
  const slide = 0.5 * 260 * Math.pow(Math.max(0, t2 - CUE.melt2 - (5 - i) * 0.03), 2);
  return { x: x + dx, y: y + slide, rot: -slope * 0.55, sc };
}

export function drawOpeningText(g, cam, t, t2, boil) {
  if (t > 9.6) return;
  const m = M(cam);
  for (let i = 0; i < S.GLYPHS.length; i++) {
    const G = S.GLYPHS[i];
    const st = glyphState(i, t, t2);
    const dissolve = clamp((t2 - (CUE.melt + 0.35 + (5 - i) * 0.07)) / 1.5);
    setM(g, m);
    g.translate(st.x, st.y);
    g.rotate(st.rot);
    g.scale(st.sc, st.sc);
    const ox = -G.cx, oy = -G.cy;
    // wet ink: a soft halo that is strongest as the brush lands, and again when the ink dissolves
    const wet = 1 - smoothstep(0, 2.4, t);
    g.globalAlpha = (0.14 + 0.26 * wet + 0.35 * Math.sin(Math.PI * dissolve)) * (1 - dissolve * 0.9);
    const hb = 1 + 0.05 * (1 - wet) + dissolve * 0.25;
    g.drawImage(G.b, ox - (G.S * (hb - 1)) / 2, oy - (G.S * (hb - 1)) / 2, G.S * hb, G.S * hb);
    g.globalAlpha = clamp(1 - ease.cubicIn(dissolve) * 1.05);
    if (g.globalAlpha > 0) g.drawImage(G.c, ox, oy);
    g.globalAlpha = 1;
  }
  g.setTransform(1, 0, 0, 1, 0, 0);
  drawDrips(g, cam, t, t2, boil);
}

function drawDrips(g, cam, t, t2, boil) {
  if (t2 < CUE.melt) return;
  setM(g, M(cam));
  for (const d of DRIPS) {
    const tau = t2 - d.t0;
    if (tau <= 0) continue;
    const st = glyphState(d.gi, t, t2);
    const c = Math.cos(st.rot), s = Math.sin(st.rot);
    const bx = st.x + (d.lx * c - d.ly * s) * st.sc, by = st.y + (d.lx * s + d.ly * c) * st.sc;
    const col = C.ink;
    if (tau < d.hang) {
      // hanging: a stem that swells into a bead
      const u = tau / d.hang;
      const len = d.Lmax * ease.cubicIn(u) + 4 * u;
      const r = d.w * (0.45 + 0.4 * u);
      ribbon(g, [[bx, by - 4], [bx + 0.5, by + len * 0.5], [bx, by + len]], { w: d.w * 0.9, color: col, alpha: 0.95, seed: d.seed, boil, wob: 0.4, taper: [2, 2], pressure: -0.3, step: 3 });
      g.beginPath();
      g.ellipse(bx, by + len, r, r * (1.1 + 0.3 * u), 0, 0, TAU);
      g.fillStyle = rgba(col, 0.95);
      g.fill();
    } else {
      // detached: the stem springs back, the drop falls and smears
      const k = tau - d.hang;
      const stem = d.Lmax * (0.35 + 0.65 * Math.exp(-k * 9) * Math.cos(k * 30));
      ribbon(g, [[bx, by - 4], [bx, by + stem]], { w: d.w * 0.85, color: col, alpha: 0.95 * clamp(1 - (t2 - CUE.melt - 1.6) / 0.8), seed: d.seed, boil, wob: 0.4, taper: [2, d.w], pressure: 0, step: 3 });
      const yv = by + d.Lmax + 0.5 * 2300 * k * k;
      const v = 2300 * k;
      const r = d.w * 0.8;
      const tail = Math.min(320, 6 + v * 0.06);
      ribbon(g, [[bx, yv - tail], [bx, yv]], { w: r * 1.7, color: col, alpha: 0.9, seed: d.seed + 1, boil, wob: 0.4, taper: [tail * 0.9, 2], pressure: 0, step: 4 });
      g.beginPath();
      g.ellipse(bx, yv, r, r * (1 + Math.min(1.6, v / 1400)), 0, 0, TAU);
      g.fillStyle = rgba(col, 0.92);
      g.fill();
    }
  }
}

// ---------------------------------------------------------------- the hero drop
// One bead of ink from 凉 that the camera rides all the way down to the canal.
export const HERO = { detach: 7.0, land: 9.24, x: 0, y0: 0, landY: 2522 };
export function heroAnchor() {
  const G = S.GLYPHS[4];
  const [gx, gy] = glyphPos(4);
  return [gx + 18, gy + G.h * 0.45];
}

export function drawHeroDrop(g, cam, camPrev, t, t2, boil) {
  if (t < CUE.melt2 || t > HERO.land + 0.05) return;
  setM(g, M(cam));
  const [ax, ay0] = heroAnchor();
  const st = glyphState(4, t, t2);
  const ax2 = st.x + 18, ay = st.y + (ay0 - glyphPos(4)[1]);
  const col = C.ink;
  if (t < HERO.detach) {
    const u = clamp((t - CUE.melt2) / (HERO.detach - CUE.melt2));
    const len = 10 + 90 * ease.cubicIn(u);
    const r = 7 + 6 * u;
    ribbon(g, [[ax2, ay - 6], [ax2, ay + len]], { w: 10, color: col, alpha: 0.95, seed: 4001, boil, wob: 0.4, taper: [2, 2], pressure: -0.3, step: 3 });
    g.beginPath();
    g.ellipse(ax2, ay + len, r, r * 1.2, 0, 0, TAU);
    g.fillStyle = rgba(col, 0.96);
    g.fill();
    return;
  }
  // falling with the camera: fixed-ish place on screen while the world rushes up
  const k = clamp((t - HERO.detach) / (HERO.land - HERO.detach));
  const yStart = ay + 100;
  const off0 = yStart - camera(HERO.detach).y;
  const offEnd = HERO.landY - 2240;
  // screen offset: rises to the centre of the frame while the world rushes past, then sinks onto the water
  const off = keyed([[0, off0], [0.38, -40, ease.cubicOut], [0.78, 10], [1, offEnd, ease.cubicIn]], k);
  const y = cam.y + off;
  const x = ax2;
  const v = Math.max(0, (cam.y - camPrev.y) * 30);
  const r = 12;
  const tail = Math.min(520, 10 + v * 0.16);
  const sq = 1 + Math.min(1.2, v / 1600);
  ribbon(g, [[x, y - tail], [x, y - tail * 0.3], [x, y]], { w: r * 1.6, color: col, alpha: 0.9, seed: 4002, boil, wob: 0.5, taper: [tail * 0.95, 2], pressure: 0, step: 4 });
  g.beginPath();
  g.ellipse(x, y, r / Math.sqrt(sq), r * sq, 0, 0, TAU);
  g.fillStyle = rgba(col, 0.95);
  g.fill();
}
