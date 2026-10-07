// 7 - 16 s: the falling ink becomes rain over white-walled houses by a canal (人间); lamps come on.
// The whole roofscape is ONE brush line drawn on the beats - thick on the level runs, thin on the risers,
// so the town reads like a melody on a staff.
import { clamp, lerp, smoothstep, ease, curve, noise1, h01, rng, TAU, rgba } from '../lib/util.js';
import { resample, ribbon, pencil, wash, washPoly, fillPts } from '../lib/draw.js';
import { C, CUE, S, M, setM } from '../core.js';
import { heroAnchor } from './opening.js';
const HERO_X = () => heroAnchor()[0];

export const BANK = 2460; // foot of the walls / the path
export const WATER = 2478; // waterline (reflection axis)
const REF = [0, 2240];
let RAIN = [], HOUSES = [], ROOF = null, BACKROOF = null;

// hand-placed blocks: [x0, x1, eaveY, steps, depth]  (steps = stepped gable 马头墙, 0 = plain tiled eave)
const BLOCKS = [
  [-820, -470, 2150, 2, 0], [-470, -200, 2235, 0, 0], [-300, 30, 2070, 3, 1], [-170, 230, 2165, 2, 0],
  [230, 420, 2250, 0, 0], [350, 700, 2095, 2, 1], [420, 760, 2180, 2, 0], [760, 1010, 2262, 0, 0], [880, 1180, 2140, 2, 1],
];
const STEP_H = 46, STEP_W = 52;

export function buildTown() {
  const R = rng(4242);
  RAIN = [];
  for (let i = 0; i < 560; i++) {
    const p = R() < 0.16 ? 1.3 + R() * 0.2 : R() < 0.3 ? 0.8 : 1.0;
    RAIN.push({
      x: -1300 + R() * 3800, y0: R() * 4400, v: 2000 + R() * 1000, len: 46 + R() * 110,
      w: 1.0 + R() * 1.3, a: 0.3 + R() * 0.5, born: CUE.fall + 0.1 + R() * 1.4, seed: i * 7 + 3, p,
    });
  }
  HOUSES = BLOCKS.map(([x0, x1, eave, steps, depth], i) => {
    const R2 = rng(77 + i * 13);
    const wins = [];
    const n = depth ? 1 : 1 + Math.floor(R2() * 2.2);
    for (let k = 0; k < n; k++) {
      const w = depth ? 26 : 34 + R2() * 14, h = depth ? 30 : 42 + R2() * 16;
      const x = lerp(x0 + 40, x1 - 40 - w, n === 1 ? 0.3 + R2() * 0.4 : k / (n - 1));
      wins.push({ x, y: eave + 60 + R2() * 70, w, h, lit: R2() });
    }
    const door = !depth && R2() < 0.55 ? { x: lerp(x0 + 50, x1 - 110, R2()), w: 56, h: 108 } : null;
    return { x0, x1, eave, steps, depth, wins, door, i };
  });
  ROOF = roofLine(HOUSES.filter((h) => !h.depth));
  BACKROOF = roofLine(HOUSES.filter((h) => h.depth));
}

// continuous roof profile over a set of blocks (left -> right)
function roofLine(hs) {
  const runs = [];
  let pts = [];
  let lastX = null;
  for (const h of hs) {
    if (lastX !== null && h.x0 - lastX > 30) { runs.push(pts); pts = []; }
    lastX = h.x1;
    const top = h.eave - h.steps * STEP_H;
    if (!h.steps) {
      pts.push([h.x0 - 8, h.eave + 6], [h.x0, h.eave], [h.x1, h.eave + 2], [h.x1 + 8, h.eave + 8]);
      continue;
    }
    let x = h.x0;
    pts.push([x - 4, h.eave + 30]);
    for (let k = 0; k < h.steps; k++) {
      const y = h.eave - k * STEP_H;
      pts.push([x, y], [x - 9, y - 8], [x + 3, y - 2]);
      x += STEP_W;
      pts.push([x, y - 2]);
    }
    pts.push([x, top]);
    const mid = h.x1 - h.x0 - 2 * STEP_W * h.steps;
    x += mid;
    pts.push([x, top]);
    for (let k = h.steps - 1; k >= 0; k--) {
      const y = h.eave - k * STEP_H;
      pts.push([x, y - 2]);
      x += STEP_W;
      pts.push([x - 3, y - 2], [x + 9, y - 8], [x, y]);
    }
    pts.push([x + 4, h.eave + 30]);
  }
  runs.push(pts);
  const all = runs.flat();
  return { pts: all, runs: runs.map((r) => ({ pts: r, rs: resample(r, 4) })), rs: resample(all, 4) };
}

// brush held at an angle: level runs fat, risers thin
function roofWidth(rs, base) {
  return (u, s) => {
    const i = Math.min(rs.x.length - 2, Math.max(0, Math.round((s / rs.L) * (rs.x.length - 1))));
    const dx = rs.x[i + 1] - rs.x[i], dy = rs.y[i + 1] - rs.y[i];
    const c = Math.abs(dx) / (Math.hypot(dx, dy) || 1);
    return lerp(0.22, 1, Math.pow(c, 3)) * base;
  };
}

// ---------------------------------------------------------------- rain
export function rainSpeed(t) {
  return 1 - ease.cubicOut(clamp((t - CUE.toBamboo) / 1.3));
}
function rainTime(t) {
  const t0 = CUE.toBamboo, d = 1.3;
  if (t <= t0) return t;
  const u = clamp((t - t0) / d);
  return t0 + (d * (1 - Math.pow(1 - u, 4))) / 4;
}

export function drawRain(g, cam, t, t2, boil) {
  if (t < CUE.fall || t > 16.2) return;
  const rt = rainTime(t2);
  const vs = rainSpeed(t2);
  const wind = -0.14;
  const fadeOut = 1 - smoothstep(14.4, 15.6, t);
  for (const d of RAIN) {
    if (t2 < d.born) continue;
    setM(g, M(cam, d.p));
    const span = 4400;
    const yy = ((d.y0 + d.v * (rt - d.born)) % span) + cam.y * d.p - 2200;
    if (yy > WATER + 20 && d.p <= 1.1) continue; // falls into the canal
    const xx = d.x + (yy - cam.y) * wind;
    const near = d.p > 1.1;
    const len = d.len * (0.2 + 0.8 * vs) * (near ? 1.8 : 1);
    const ain = clamp((t2 - d.born) / 0.35);
    const a = d.a * ain * fadeOut * (d.p < 0.9 ? 0.45 : near ? 0.55 : 1);
    if (a <= 0.01) continue;
    ribbon(g, [[xx, yy], [xx + wind * len, yy + len]], {
      w: d.w * (near ? 2.3 : 1), color: d.p < 0.9 ? C.slate : C.graphite, alpha: a, seed: d.seed, boil, wob: 0.5,
      taper: [len * 0.75, 3], pressure: 0, step: 6,
    });
  }
}

export function drawRainSky(wg, cam, t, t2, boil) {
  if (t < 6.8 || t > 17) return;
  setM(wg, M(cam, 0.9));
  const k = ease.expoOut(clamp((t - 7.0) / 2.6));
  const fade = 1 - smoothstep(14.6, 16.6, t);
  const a = k * fade;
  if (a <= 0) return;
  // soft graded sky, darker at the top, dissolving into the paper above the roofs
  const top = cam.y - 1600, bot = 2200;
  const gr = wg.createLinearGradient(0, top + 600, 0, bot);
  gr.addColorStop(0, rgba(C.indigoWash, 0.55 * a));
  gr.addColorStop(0.55, rgba(C.slate, 0.3 * a));
  gr.addColorStop(1, rgba(C.slate, 0));
  wg.fillStyle = gr;
  wg.fillRect(cam.x - 1300, top, 2600, bot - top);
  // cloud banks at three depths: the camera falls through them
  for (const [p, n, ya, yb, al, sz] of [[0.7, 5, 900, 1900, 0.2, 1], [1.0, 6, 300, 1950, 0.22, 1.1], [1.4, 4, -200, 1700, 0.12, 1.8]]) {
    setM(wg, M(cam, p, [110, 2240]));
    for (let i = 0; i < n; i++) {
      const R = rng(620 + i + p * 100);
      const cx = -500 + R() * 1300 + t2 * (6 + R() * 12) * (p > 1.2 ? 2 : 1), cy = lerp(ya, yb, (i + R() * 0.8) / n);
      const r = (170 + R() * 200) * sz;
      const g = clamp((t - 7.0 - (2000 - cy) / 1400) / 1.4);
      if (g <= 0) continue;
      wash(wg, cx, cy, r * (0.6 + 0.4 * ease.expoOut(g)), r * 0.4 * (0.6 + 0.4 * ease.expoOut(g)), { color: C.indigoWash, alpha: al * a * ease.cubicOut(g), layers: 3, seed: 630 + i + p * 10, boil: Math.floor(boil / 6), rough: 0.3, edge: 0.35 });
    }
  }
}

// ---------------------------------------------------------------- houses + canal
// P maps a world point (used to draw the same town mirrored in the water)
function drawHouses(lg, wg, t, t2, boil, dp, fade, P, refl) {
  const A = refl ? 0.42 : 1;
  const map = (pts) => pts.map(([x, y]) => P(x, y));
  const xFirst = HOUSES[0].x0, xLast = 1200;
  const reachX = xFirst - 40 + dp * (xLast - xFirst + 80);
  for (const pass of [1, 0]) {
    for (const h of HOUSES) {
      if (h.depth !== pass) continue;
      const rv = clamp((reachX - h.x0) / (h.x1 - h.x0));
      if (rv <= 0) continue;
      const a = ease.cubicOut(rv) * fade * A;
      const top = h.eave - h.steps * STEP_H;
      // occlude whatever is behind with the white of the wall
      const wall = [[h.x0, h.eave + 6], [h.x1, h.eave + 6], [h.x1, BANK], [h.x0, BANK]];
      if (!pass) {
        for (const g of [wg, lg]) { fillPts(g, map(wall)); g.fillStyle = `rgba(255,255,255,${a / A})`; g.fill(); }
      } else {
        washPoly(wg, map([[h.x0, top + 4], [h.x1, top + 4], [h.x1, BANK], [h.x0, BANK]]), { color: C.slate, alpha: 0.14 * a, layers: 2, jit: 3, seed: h.i + 41 });
      }
      // shaded side of the wall + damp stain at the foot
      const side = h.i % 2 ? [[h.x1 - 46, h.eave + 8], [h.x1, h.eave + 8], [h.x1, BANK], [h.x1 - 40, BANK]] : [[h.x0, h.eave + 8], [h.x0 + 46, h.eave + 8], [h.x0 + 40, BANK], [h.x0, BANK]];
      washPoly(wg, map(side), { color: C.slate, alpha: (pass ? 0.22 : 0.3) * a, layers: 2, jit: 4, seed: h.i + 3 });
      washPoly(wg, map([[h.x0 + 3, BANK - 70 - (h.i % 3) * 18], [h.x1 - 3, BANK - 54], [h.x1 - 3, BANK], [h.x0 + 3, BANK]]),
        { color: C.celadonDeep, alpha: 0.22 * a, layers: 3, jit: 12, seed: h.i + 19 });
      // eave shadow + tiles
      washPoly(wg, map([[h.x0, h.eave + 4], [h.x1, h.eave + 4], [h.x1, h.eave + 26], [h.x0, h.eave + 30]]), { color: C.slate, alpha: 0.4 * a, layers: 2, jit: 3, seed: h.i + 5 });
      if (!h.steps) {
        washPoly(wg, map([[h.x0 + 4, h.eave - 28], [h.x1 - 4, h.eave - 26], [h.x1, h.eave], [h.x0, h.eave]]), { color: C.ink, alpha: 0.3 * a, layers: 2, jit: 2, seed: h.i + 6 });
        if (!pass && !refl) for (let x = h.x0 + 10; x < h.x1 - 6; x += 13) {
          ribbon(lg, map([[x, h.eave - 27], [x + 1, h.eave - 2]]), { w: 2.2, color: C.ink, alpha: 0.55 * a, seed: x, boil, wob: 0.3, pressure: 0, taper: [3, 3] });
        }
      } else {
        // caps: grey tile wash on each step
        for (let k = 0; k < h.steps; k++) {
          const y = h.eave - k * STEP_H;
          washPoly(wg, map([[h.x0 + k * STEP_W - 8, y - 10], [h.x0 + (k + 1) * STEP_W, y - 10], [h.x0 + (k + 1) * STEP_W, y + 4], [h.x0 + k * STEP_W - 8, y + 4]]), { color: C.ink, alpha: 0.35 * a, layers: 1, jit: 1, seed: h.i * 9 + k });
          washPoly(wg, map([[h.x1 - (k + 1) * STEP_W, y - 10], [h.x1 - k * STEP_W + 8, y - 10], [h.x1 - k * STEP_W + 8, y + 4], [h.x1 - (k + 1) * STEP_W, y + 4]]), { color: C.ink, alpha: 0.35 * a, layers: 1, jit: 1, seed: h.i * 9 + k + 4 });
        }
        washPoly(wg, map([[h.x0 + h.steps * STEP_W, top - 10], [h.x1 - h.steps * STEP_W, top - 10], [h.x1 - h.steps * STEP_W, top + 4], [h.x0 + h.steps * STEP_W, top + 4]]), { color: C.ink, alpha: 0.35 * a, layers: 1, jit: 1, seed: h.i * 9 + 8 });
      }
      if (pass) {
        // far houses are drawn only in wash
        continue;
      }
      // walls: thin verticals, drawn just after the roof line passes
      const wr = clamp((reachX - h.x1) / 240);
      for (const [k, wx] of [[0, h.x0 + 1], [1, h.x1 - 1]]) {
        const pp = curve.stroke(clamp(wr * 1.5 - k * 0.25));
        if (pp > 0) ribbon(lg, map([[wx, h.eave + (h.steps ? 30 : 8)], [wx + 1, BANK + 4]]), { w: 2.0, color: C.ink, alpha: 0.8 * a, from: 0, to: pp, seed: 1900 + h.i + k, boil, wob: 1.2, taper: [4, 30] });
      }
      if (h.door) {
        const pp = curve.stroke(clamp(wr * 1.3 - 0.35));
        if (pp > 0) {
          const { x, w, h: dh } = h.door;
          washPoly(wg, map([[x, BANK - dh], [x + w, BANK - dh], [x + w, BANK], [x, BANK]]), { color: C.ink, alpha: 0.62 * a * pp, layers: 2, jit: 2, seed: h.i + 77 });
          pencil(lg, map([[x - 6, BANK - dh - 8], [x + w + 6, BANK - dh - 8]]), { w: 3, color: C.ink, alpha: 0.8 * a, from: 0, to: pp, seed: 2200 + h.i, boil, wob: 0.6, taper: [3, 3] });
        }
      }
    }
  }
  // windows + lamps
  for (const h of HOUSES) {
    const wr = clamp((reachX - h.x1) / 200);
    if (wr <= 0) continue;
    for (const wd of h.wins) {
      const pp = curve.stroke(clamp(wr * 1.2 - 0.1));
      const { x, y, w, h: wh } = wd;
      const lampT = wd.lit < 0.42 ? CUE.lamp1 + wd.lit * 0.25 : wd.lit < 0.8 ? CUE.lamp2 + (wd.lit - 0.42) * 0.3 : 99;
      const lp = clamp((t2 - lampT) / 0.45);
      const af = fade * A * (h.depth ? 0.7 : 1);
      washPoly(wg, map([[x, y], [x + w, y], [x + w, y + wh], [x, y + wh]]), { color: C.ink, alpha: 0.7 * pp * af * (1 - lp * 0.9), layers: 2, jit: 1.2, seed: x });
      if (lp > 0) {
        const glow = ease.backOut(lp, 2.6);
        const [cx, cy] = P(x + w / 2, y + wh / 2);
        wash(wg, cx, cy, (w / 2 + 2) * glow, (wh / 2 + 2) * glow, { color: C.ochre, alpha: 0.9 * af, layers: 3, seed: x, boil: Math.floor(boil / 3), rough: 0.08 });
        wash(wg, cx, cy, w * 1.9 * glow, wh * 1.5 * glow, { color: C.ochre, alpha: 0.13 * af, layers: 2, seed: x + 1, boil: Math.floor(boil / 3), edge: 0 });
        if (!refl) for (let k = 1; k < 3; k++) ribbon(lg, map([[x + (w * k) / 3, y + 2], [x + (w * k) / 3, y + wh - 2]]), { w: 1.4, color: C.ink, alpha: 0.7 * af, seed: x + k, boil, wob: 0.3, pressure: 0, taper: [2, 2] });
      }
      if (!h.depth) pencil(lg, map([[x, y], [x + w, y], [x + w, y + wh], [x, y + wh], [x, y + 2]]), { w: 1.8, color: C.ink, alpha: 0.8 * af, from: 0, to: pp, seed: 2100 + x, boil, wob: 0.7, taper: [3, 3] });
    }
  }
  // the roof line itself - one brush, drawn on the beats
  const rs = refl ? resample(map(ROOF.pts), 4) : ROOF.rs;
  const total = ROOF.rs.L;
  ribbon(lg, null, { rs, w: 13, wfn: roofWidth(ROOF.rs, 1), color: C.ink, alpha: 0.95 * fade * A, from: 0, to: dp, seed: 1800, boil, wob: 1.0, taper: [10, 10], pressure: 0, step: 4 });
  if (!refl) {
    for (const run of BACKROOF.runs) {
      const brs = run.rs;
      const x0 = run.pts[0][0];
      const pr = clamp((reachX - x0) / 400);
      if (pr > 0) ribbon(lg, null, { rs: brs, w: 9, wfn: roofWidth(brs, 1), color: C.slate, alpha: 0.8 * fade, from: 0, to: curve.stroke(pr), seed: 1801 + x0, boil, wob: 1.0, taper: [10, 10], pressure: 0, step: 4 });
    }
  }
  return total;
}

export function drawTown(lg, wg, cam, t, t2, boil) {
  if (t < 8.0 || t > 17.5) return;
  // the brush runs along the roofs, pushed forward on each beat
  const beats = S.AUDIO.beats.filter((b) => b >= 8.3 && b <= 11.8);
  const t0 = beats[0], t1 = beats[beats.length - 1];
  let dp = 0;
  if (t2 > t0) {
    let k = 0;
    while (k < beats.length - 1 && beats[k + 1] <= t2) k++;
    const local = clamp((t2 - beats[k]) / Math.max(0.05, (beats[k + 1] || t1) - beats[k]));
    dp = clamp((k + curve.stroke(local)) / (beats.length - 1));
    if (t2 >= t1) dp = 1;
  }
  const fade = 1 - smoothstep(15.2, 16.8, t);
  const m = M(cam, 1, REF);
  setM(lg, m);
  setM(wg, m);
  // canal: a cool wash under the bank, then the reflection broken by ripples
  const wv = ease.expoOut(clamp((t - 8.6) / 2.0));
  washPoly(wg, [[-1300, WATER], [1900, WATER], [1900, WATER + 900], [-1300, WATER + 900]], { color: C.indigoWash, alpha: 0.32 * wv * fade, layers: 3, jit: 8, seed: 611 });
  const rip = (x, y) => {
    const d = y - WATER;
    return [x + Math.sin(d * 0.09 + t2 * 3.1) * (2 + d * 0.025) + noise1(d * 0.05, 3) * 6, WATER + d * 0.92];
  };
  drawHouses(lg, wg, t, t2, boil, Math.max(0, dp - 0.06), fade * wv, (x, y) => rip(x, 2 * WATER - y), true);
  // the hero drop lands: an ink cloud unfurls in the canal, rings run out
  {
    const k = t - CUE.town;
    if (k > 0) {
      const hx = HERO_X(), hy = 2522;
      const u = ease.expoOut(clamp(k / 2.4));
      wash(wg, hx, hy + 40 * u, 30 + 260 * u, 8 + 70 * u, { color: C.indigo, alpha: 0.55 * (1 - smoothstep(1.5, 5, k)) * fade, layers: 4, seed: 707, boil: Math.floor(boil / 3), rough: 0.35, edge: 0.4 });
      for (let r = 0; r < 4; r++) {
        const kk = k - r * 0.11;
        if (kk <= 0 || kk > 2.2) continue;
        const rr = 20 + ease.expoOut(clamp(kk / 2.2)) * (420 - r * 60);
        lg.beginPath();
        lg.ellipse(hx, hy, rr, rr * 0.16, 0, 0, TAU);
        lg.strokeStyle = rgba(C.ink, 0.75 * (1 - kk / 2.2) * fade);
        lg.lineWidth = 2.6 - r * 0.4;
        lg.stroke();
      }
      // crown splash
      if (k < 0.5) {
        const R = rng(808);
        for (let i = 0; i < 9; i++) {
          const ang = -Math.PI / 2 + (R() - 0.5) * 2.2;
          const sp = 260 + R() * 340;
          const px = hx + Math.cos(ang) * sp * k, py = hy + Math.sin(ang) * sp * k + 0.5 * 2400 * k * k;
          lg.beginPath();
          lg.ellipse(px, py, 4 + R() * 3, 6 + R() * 4, ang, 0, TAU);
          lg.fillStyle = rgba(C.ink, 0.9 * (1 - k / 0.5));
          lg.fill();
        }
      }
    }
  }
  // water lines over the reflection (the strings again, lying down)
  for (let k = 0; k < 9; k++) {
    const y = WATER + 30 + k * k * 9 + k * 14;
    const R = rng(900 + k);
    let x = -1200 + R() * 200;
    while (x < 1900) {
      const len = 60 + R() * 240;
      const p = clamp((t2 - 9.6 - k * 0.12 - (x + 1200) / 4000) / 0.6);
      if (p > 0) ribbon(lg, [[x, y], [x + len * curve.stroke(p), y + 1]], { w: 1.6 + k * 0.15, color: C.graphite, alpha: 0.55 * fade, seed: x + k, boil, wob: 1.0, taper: [10, 10], pressure: 0 });
      x += len + 30 + R() * 180;
    }
  }
  drawHouses(lg, wg, t, t2, boil, dp, fade, (x, y) => [x, y], false);
  // the path along the bank
  const lane = clamp((t2 - 9.9) / 1.2);
  if (lane > 0) pencil(lg, [[-1200, BANK + 4], [-300, BANK + 2], [500, BANK + 6], [1600, BANK + 3]], { w: 3, color: C.ink, alpha: 0.85 * fade, from: 0, to: curve.stroke(lane), seed: 2500, boil, wob: 1.4, taper: [20, 60] });
  // rain rings on the canal
  if (t2 > 9.3 && t2 < CUE.toBamboo + 0.9) {
    for (let k = 0; k < 26; k++) {
      const R = rng(k * 31 + 7);
      const period = 0.5 + R() * 0.5;
      const ph = R() * period;
      const age = ((t2 - ph) % period) / period;
      const cyc = Math.floor((t2 - ph) / period);
      const R2 = rng(k * 101 + cyc * 7);
      const x = cam.x - 600 + R2() * 1200, y = WATER + 30 + Math.pow(R2(), 1.4) * 520;
      const sc = 0.5 + (y - WATER) / 700;
      const r = (8 + age * 40) * sc;
      lg.beginPath();
      lg.ellipse(x, y, r, r * 0.22, 0, 0, TAU);
      lg.strokeStyle = rgba(C.graphite, 0.5 * (1 - age) * fade);
      lg.lineWidth = 1.6;
      lg.stroke();
    }
  }
}

// a small person (人) under a red umbrella, walking along the bank; mirrored in the canal
export function drawWalker(lg, wg, cam, t, t2, boil) {
  if (t < 9.6 || t > 16.8) return;
  const tt = t2 - 9.9;
  if (tt < 0) return;
  const fade = 1 - smoothstep(15.4, 16.4, t);
  const x = -300 + tt * 64;
  for (const refl of [true, false]) {
    setM(lg, M(cam, 1, REF));
    setM(wg, M(cam, 1, REF));
    for (const g of [lg, wg]) {
      g.save();
      g.translate(x, refl ? 2 * WATER - BANK : BANK);
      if (refl) g.scale(1, -0.9);
      g.scale(1.45, 1.45);
    }
    figure(lg, wg, t2, boil, fade * (refl ? 0.4 : 1), clamp(tt / 0.5));
    for (const g of [lg, wg]) g.restore();
  }
}

function figure(lg, wg, t2, boil, a, appear) {
  const ph = (t2 * 1.9) % 1;
  const bob = Math.abs(Math.sin(ph * TAU)) * 4;
  const s = ease.backOut(appear, 2);
  lg.scale(s, s); wg.scale(s, s);
  const sw = Math.sin(ph * TAU) * 0.45;
  const hip = [0, -38 - bob];
  pencil(lg, [hip, [Math.sin(sw) * 22, 0]], { w: 3.6, color: C.ink, alpha: 0.95 * a, seed: 3001, boil, wob: 0.5, taper: [4, 2], pressure: 0 });
  pencil(lg, [[hip[0] + 2, hip[1] + 6], [-Math.sin(sw) * 22, 0]], { w: 3.2, color: C.ink, alpha: 0.95 * a, seed: 3002, boil, wob: 0.5, taper: [4, 2], pressure: 0 });
  pencil(lg, [[0, -40 - bob], [3, -80 - bob]], { w: 5, color: C.ink, alpha: 0.95 * a, seed: 3003, boil, wob: 0.4, pressure: 0 });
  lg.beginPath(); lg.arc(4, -90 - bob, 7.5, 0, TAU); lg.fillStyle = rgba(C.ink, 0.95 * a); lg.fill();
  const tilt = -0.2 + Math.sin(t2 * 2.3) * 0.05;
  lg.rotate(tilt); wg.rotate(tilt);
  pencil(lg, [[7, -70 - bob], [7, -134 - bob]], { w: 2.2, color: C.ink, alpha: 0.9 * a, seed: 3004, boil, wob: 0.3, pressure: 0 });
  const canopy = [];
  for (let k = 0; k <= 16; k++) {
    const an = Math.PI + (k / 16) * Math.PI;
    canopy.push([7 + Math.cos(an) * 54, -128 - bob + Math.sin(an) * 28]);
  }
  wash(wg, 7, -142 - bob, 52, 19, { color: C.vermilion, alpha: 0.9 * a, layers: 3, seed: 3005, boil: Math.floor(boil / 2), rough: 0.1 });
  pencil(lg, canopy, { w: 2.6, color: C.ink, alpha: 0.9 * a, seed: 3006, boil, wob: 0.6, taper: [6, 6] });
  const rim = [];
  for (let k = 0; k <= 24; k++) rim.push([7 - 54 + (k / 24) * 108, -128 - bob - Math.abs(Math.sin((k / 24) * Math.PI * 4)) * 5]);
  pencil(lg, rim, { w: 2.0, color: C.ink, alpha: 0.8 * a, seed: 3007, boil, wob: 0.4, taper: [4, 4] });
}
