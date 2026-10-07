// 28.5 - 69.6 s: after the page turn the stalks are water lines. Dusk, a ridge drawn by the pen, the moon,
// a little boat (the same 人 with the red umbrella). Strikes strum the water; at the apex a bloom of clear
// water washes the night away and only one line - the string - is left. Then the poem is written again.
import { clamp, lerp, smoothstep, ease, curve, noise1, fbm1, h01, rng, TAU, rgba, mixc, springImpulse, keyed, bezier } from '../lib/util.js';
import { resample, ribbon, pencil, flick, wash, washPoly, fillPts, splash } from '../lib/draw.js';
import { C, CUE, S, M, setM, mul, W, H } from '../core.js';
import { LINES, STRUMS, WAVES, HPLUCKS, LM, HORIZON_V, ROLL, morph, waterDisp, waveShape, P, night, storm, flash, inhale, LIGHTNING } from './lines.js';
export { night, storm };
import { camera } from '../camera.js';

// local camera (u along river, v across), handy for placing things relative to the view
export function camLocal(t) {
  const c = camera(t);
  return { u: c.y - P[1], v: P[0] - c.x, z: c.z };
}

// radius of the clearing bloom (local px) centred on the moon
export const clearR = (t) => (t < CUE.apex ? 0 : 30 + ease.cubicOut(clamp((t - CUE.apex) / 1.8)) * 2800);

const MOON_REF_T = 42.7;
let MOON_REF = null; // camera (world) when the moon is drawn; moon is far, so it nearly rides with the camera
export const MOON = { su: -70, sv: -430, r: 104 }; // offset from camera centre in local px at the reference time

let RIDGE = null, RIDGE2 = null;

export function buildRiver() {
  const c = camera(MOON_REF_T);
  MOON_REF = [c.x, c.y];
  // ridges: long polylines along u (sky side, v < horizon)
  const mk = (seed, base, amp, u0, u1) => {
    const pts = [];
    for (let u = u0; u <= u1; u += 12) {
      const n = fbm1(u / 520, seed, 4);
      const peak = Math.pow(Math.max(0, n * 0.5 + 0.5), 1.6);
      pts.push([u, base - amp * peak - 10 * noise1(u / 60, seed + 3)]);
    }
    return { pts, rs: resample(pts, 6), u0, u1 };
  };
  RIDGE = mk(17, HORIZON_V - 4, 230, -800, 1350);
  RIDGE2 = mk(29, HORIZON_V - 60, 330, -800, 1350);
  // strums: every strike plucks the water near the middle of the view
  STRUMS.length = 0;
  CUE.strikes.forEach((ts, i) => {
    const cl = camLocal(ts);
    const R = rng(4000 + i);
    STRUMS.push({ t: ts, u: cl.u + (R() - 0.5) * 700, a: [5, 11, 15].includes(i) ? 1.6 : 0.9 + R() * 0.4, width: 260 + R() * 200, decay: 0.7 });
  });
  for (const [t, a] of S.AUDIO.onsets) {
    if (t > ROLL.land + 0.4 && t < CUE.climax && a > 0.32) {
      const cl = camLocal(t);
      STRUMS.push({ t, u: cl.u + (h01(t * 100, 3) - 0.5) * 900, a: a * 0.35, width: 200, decay: 0.6 });
    }
    if (t > CUE.climax && t < 46.5 && a > 0.3) {
      const cl = camLocal(t);
      STRUMS.push({ t, u: cl.u + (h01(t * 100, 5) - 0.5) * 900, a: a * 0.6, width: 240, decay: 0.6 });
    }
  }
  STRUMS.push({ t: 61.603, u: camLocal(61.6).u, a: 0.5, width: 500, decay: 1.2 });
  STRUMS.push({ t: CUE.last, u: camLocal(CUE.last).u - 100, a: 0.35, width: 600, decay: 1.4 });
  // contour-line waves: the water lines themselves rise and fold on the strongest strikes
  WAVES.length = 0;
  for (const [t, du, sc] of [[48.762, 260, 0.55], [49.621, -300, 0.6], [51.27, -120, 1.0], [54.242, 220, 1.15],
    [55.705, -200, 1.25], [57.168, 160, 0.8], [58.839, -60, 0.95]]) {
    WAVES.push({ t, u: camLocal(t).u + du, s: sc });
  }
  // the horizon is plucked like a string once everything else has been washed away
  HPLUCKS.length = 0;
  for (const [t, a, dc] of [[CUE.apex, 34, 0.9], [61.603, 22, 0.9], [CUE.last, 14, 1.1], [CUE.twitch, 11, 0.6], [67.315, 6, 0.5]]) {
    const cl = camLocal(t);
    HPLUCKS.push({ t, a, decay: dc, u0: cl.u - 640 / cl.z, u1: cl.u + 640 / cl.z });
  }
}

function ridgeV(u) {
  const pts = RIDGE.pts;
  const i = clamp(Math.floor((u - RIDGE.u0) / 12), 0, pts.length - 2);
  const f = clamp((u - pts[i][0]) / 12);
  return lerp(pts[i][1], pts[i + 1][1], f);
}
function ridgeProgress(t2) {
  const beats = S.AUDIO.beats.filter((b) => b >= 30.0 && b <= 37.4);
  if (t2 <= beats[0]) return -1e9;
  let k = 0;
  while (k < beats.length - 1 && beats[k + 1] <= t2) k++;
  const local = clamp((t2 - beats[k]) / Math.max(0.05, (beats[k + 1] || beats[k]) - beats[k]));
  const dp = clamp((k + curve.stroke(local)) / (beats.length - 1));
  return RIDGE.u0 + (RIDGE.u1 - RIDGE.u0) * dp;
}

export function moonPos(cam) {
  // returns local coordinates of the moon for the current camera (parallax ~0.06)
  const cl = { u: cam.y - P[1], v: P[0] - cam.x };
  const ref = { u: MOON_REF[1] - P[1], v: P[0] - MOON_REF[0] };
  const p = 0.15;
  return [ref.u + MOON.su + (cl.u - ref.u) * (1 - p), ref.v + MOON.sv + (cl.v - ref.v) * (1 - p)];
}

// ---------------------------------------------------------------- sky + water washes
export function drawRiverWashes(wg, cam, t, t2, boil) {
  if (t < ROLL.swing) return;
  const m = morph(t);
  setM(wg, LM(cam, 1));
  const cl = { u: cam.y - P[1], v: P[0] - cam.x };
  const n = night(t), st = storm(t);
  const U0 = cl.u - 1600, U1 = cl.u + 1600;
  const [mu, mv] = moonPos(cam);
  const cr = clearR(t);
  const after = smoothstep(CUE.apex, CUE.apex + 1.4, t);
  // sky: dusk (a band of ochre afterglow low down) -> indigo night -> storm -> cleared
  const sk = m * (0.35 + 0.65 * n);
  if (sk > 0) {
    const top = cl.v - 1400;
    const gr = wg.createLinearGradient(0, top, 0, HORIZON_V);
    const deep = mixc(C.indigoWash, C.indigo, n * 0.55 + st * 0.3);
    gr.addColorStop(0, rgba(deep, (0.25 + 0.5 * n + 0.15 * st) * m));
    gr.addColorStop(0.7, rgba(mixc(C.indigoWash, C.slate, 0.5), (0.12 + 0.42 * n) * m));
    gr.addColorStop(1, rgba(C.ochre, 0.32 * (1 - n) * m + 0.1 * n * m));
    wg.save();
    clipOutsideBloom(wg, mu, mv, cr, t);
    wg.globalAlpha = 1 - 0.93 * flash(t);
    wg.fillStyle = gr;
    wg.fillRect(U0, top, U1 - U0, HORIZON_V - top + 4);
    // clouds drifting; heavier in the storm
    for (let i = 0; i < 9; i++) {
      const R = rng(1200 + i);
      const cu = cl.u - 1100 + R() * 2200 + t2 * (10 + R() * 25) * (1 + st * 3), cv = HORIZON_V - 140 - R() * 700;
      const r = 200 + R() * 260;
      const a = (0.12 + 0.3 * st + 0.08 * n) * m;
      wash(wg, ((cu - cl.u + 1500) % 3000 + 3000) % 3000 + cl.u - 1500, cv, r, r * 0.33, { color: mixc(C.indigoWash, C.indigo, st), alpha: a, layers: 3, seed: 1300 + i, boil: Math.floor(boil / 4), rough: 0.35, edge: 0.3 });
    }
    wg.restore();
  }
  // water: cool wash, darker near the viewer; the moon's road is left as bare paper
  const wa = m * (0.18 + 0.4 * n + 0.15 * st);
  if (wa > 0) {
    wg.save();
    clipOutsideBloom(wg, mu, mv, cr, t);
    wg.globalAlpha = 1 - 0.8 * flash(t);
    const gr = wg.createLinearGradient(0, HORIZON_V, 0, HORIZON_V + 1000);
    gr.addColorStop(0, rgba(C.indigoWash, wa * 0.55));
    gr.addColorStop(1, rgba(mixc(C.indigoWash, C.indigo, 0.5), wa));
    wg.fillStyle = gr;
    wg.fillRect(U0, HORIZON_V, U1 - U0, 1400);
    wg.restore();
  }
  // after the bloom: a pale, clear wash - the page is "清" (clear) and "凉" (cool)
  if (after > 0) {
    const gr = wg.createLinearGradient(0, cl.v - 900, 0, HORIZON_V + 600);
    gr.addColorStop(0, rgba(C.indigoWash, 0.0));
    gr.addColorStop(0.62, rgba(C.celadon, 0.14 * after));
    gr.addColorStop(0.66, rgba(C.indigoWash, 0.2 * after));
    gr.addColorStop(1, rgba(C.indigoWash, 0.06 * after));
    wg.fillStyle = gr;
    wg.fillRect(U0, cl.v - 1200, U1 - U0, 2600);
  }
  // the bloom's cauliflower edge: pigment pushed outward by clear water (lumpy, soft, darker at the rim)
  if (cr > 0 && cr < 2600) {
    const a = 1 - smoothstep(1300, 2600, cr);
    const ring = (k) => {
      const pts = [];
      for (let i = 0; i < 360; i++) {
        const an = (i / 360) * TAU;
        pts.push([mu + Math.cos(an) * (bloomR(an, cr) - k), mv + Math.sin(an) * (bloomR(an, cr) - k)]);
      }
      return pts;
    };
    wg.filter = 'blur(6px)';
    fillPts(wg, ring(18));
    wg.strokeStyle = rgba(C.indigo, 0.34 * a);
    wg.lineWidth = 44;
    wg.stroke();
    wg.filter = 'none';
    fillPts(wg, ring(2));
    wg.strokeStyle = rgba(C.indigo, 0.42 * a);
    wg.lineWidth = 5;
    wg.stroke();
  }
}

// rim of the clearing bloom: lumpy like a watercolour backrun
function bloomR(an, cr) {
  return cr * (1 + 0.055 * noise1(an * 3.2, 77) + 0.025 * noise1(an * 9.1, 78) + 0.008 * noise1(an * 31, 79));
}

function clipOutsideBloom(g, mu, mv, cr, t) {
  if (cr <= 0) return;
  g.beginPath();
  g.rect(-1e5, -1e5, 2e5, 2e5);
  const n = 360;
  for (let i = n; i >= 0; i--) {
    const an = (i / n) * TAU;
    const rr = bloomR(an, cr);
    const x = mu + Math.cos(an) * rr, y = mv + Math.sin(an) * rr;
    i === n ? g.moveTo(x, y) : g.lineTo(x, y);
  }
  g.closePath();
  g.clip('evenodd');
}

// ---------------------------------------------------------------- ridge, moon
export function drawRidge(lg, wg, cam, t, t2, boil) {
  if (t < 29.5) return;
  // far ridge: slower along the river (parallax in u only) but locked to the horizon
  const camU = cam.y - P[1];
  for (const g of [lg, wg]) { setM(g, LM(cam, 1)); g.translate(camU * 0.62, 0); }
  const after = smoothstep(CUE.apex, CUE.apex + 1.2, t);
  // pen traces the far ridge, pushed on the beats
  const beats = S.AUDIO.beats.filter((b) => b >= 30.0 && b <= 37.4);
  let dp = 0;
  if (t2 > beats[0]) {
    let k = 0;
    while (k < beats.length - 1 && beats[k + 1] <= t2) k++;
    const local = clamp((t2 - beats[k]) / Math.max(0.05, (beats[k + 1] || beats[k]) - beats[k]));
    dp = clamp((k + curve.stroke(local)) / (beats.length - 1));
  }
  const n = night(t);
  // second, farther ridge washes in on the brighter passage
  const r2 = ease.expoOut(clamp((t - CUE.bright) / 2.5));
  if (r2 > 0) {
    const pts = RIDGE2.pts.map(([u, v]) => [u, HORIZON_V - (HORIZON_V - v) * (0.3 + 0.7 * r2)]);
    pts.push([RIDGE2.u1, HORIZON_V], [RIDGE2.u0, HORIZON_V]);
    washPoly(wg, pts, { color: mixc(C.indigoWash, C.slate, 0.4), alpha: (0.3 + 0.2 * n) * (1 - after * 0.5), layers: 3, jit: 10, seed: 1401 });
  }
  if (dp > 0) {
    const L = RIDGE.rs.L;
    // wash fills behind the pen
    const uEnd = RIDGE.u0 + (RIDGE.u1 - RIDGE.u0) * clamp(dp - 0.03);
    const pts = RIDGE.pts.filter(([u]) => u <= uEnd);
    if (pts.length > 2) {
      pts.push([pts[pts.length - 1][0] - 160, HORIZON_V + 4], [pts[0][0], HORIZON_V + 4]);
      washPoly(wg, pts, { color: mixc(C.slate, C.indigo, 0.3 + 0.5 * n), alpha: (0.45 + 0.25 * n) * (1 - after * 0.45), layers: 3, jit: 6, seed: 1402 });
    }
    pencil(lg, null, { rs: RIDGE.rs, w: 2.6, color: C.ink, alpha: 0.85 * (1 - after * 0.3), from: 0, to: dp, seed: 1403, boil, wob: 1.5, taper: [10, 10], pressure: 0.25 });
  }
}

export function drawMoon(lg, wg, hg, cam, t, t2, boil) {
  if (t < CUE.moon - 0.1) return;
  setM(lg, LM(cam, 1));
  setM(wg, LM(cam, 1));
  const [mu, mv] = moonPos(cam);
  const r = MOON.r;
  // one circle in one stroke, beginning on the cue, slowing at the close
  const dp = bezier(0.3, 0, 0.15, 1)(clamp((t2 - CUE.moon) / 0.95));
  const pts = [];
  for (let a = -2.2; a <= -2.2 + TAU + 0.25; a += 0.05) pts.push([mu + Math.cos(a) * r * (1 + 0.012 * Math.sin(a * 3)), mv + Math.sin(a) * r]);
  // the disc is bare paper: clear the washes inside it, plus a faint glow
  const open = ease.cubicOut(clamp((t - CUE.moon - 0.5) / 1.2));
  if (open > 0) {
    wg.save();
    wg.globalCompositeOperation = 'destination-out';
    fillPts(wg, pts);
    wg.fillStyle = `rgba(0,0,0,${0.92 * open})`;
    wg.fill();
    wg.globalCompositeOperation = 'source-over';
    wg.restore();
    // halo
    setM(hg, LM(cam, 1));
    const gl = hg.createRadialGradient(mu, mv, r * 0.9, mu, mv, r * 2.6);
    gl.addColorStop(0, `rgba(255,252,240,${0.32 * open})`);
    gl.addColorStop(1, 'rgba(255,252,240,0)');
    hg.fillStyle = gl;
    hg.fillRect(mu - r * 3, mv - r * 3, r * 6, r * 6);
  }
  pencil(lg, pts, { w: 3.2, color: C.ink, alpha: 0.9, from: 0, to: dp, seed: 1500, boil, wob: 1.6, taper: [12, 30], pressure: 0.3 });
  // moon road: bare-paper dashes on the water under the moon (dimmed while clouds veil it)
  const veil = 1 - 0.75 * storm(t);
  if (open > 0) {
    wg.save();
    wg.globalCompositeOperation = 'destination-out';
    for (const L of LINES) {
      if (L.v < HORIZON_V + 4 || L.v > HORIZON_V + 900) continue;
      const depth = clamp((L.v - HORIZON_V) / 700);
      const R = rng(L.j * 31 + 5);
      const half = (30 + depth * 120) * (0.6 + R() * 0.6) * open;
      const du = (R() - 0.5) * 40 * depth + Math.sin(t2 * 2 + L.j) * 8;
      const y = L.v + waterDisp(L.v, mu + du, t2, L.phase)[1] - 6 - depth * 6;
      wg.beginPath();
      wg.ellipse(mu + du, y, half, 4 + depth * 6, 0, 0, TAU);
      wg.fillStyle = `rgba(0,0,0,${0.85 * veil})`;
      wg.fill();
    }
    wg.restore();
  }
}

// ---------------------------------------------------------------- the boat (乌篷船) with the 人 and the red umbrella
export function boatPos(t) {
  // drifts along the river slower than the camera at first, then is carried in the storm
  const u = keyed([[29, -520], [44.16, 760, ease.linear], [59.26, 1250, ease.sineInOut], [69.6, 1500, ease.sineInOut]], t);
  return [u, 300];
}

export function drawBoat(lg, wg, cam, t, t2, boil) {
  if (t < 29.6) return;
  const [bu, bv0] = boatPos(t2);
  const L = { v: bv0 };
  const st = storm(t);
  const bob = waterDisp(bv0, bu, t2)[1];
  const slope = (waterDisp(bv0, bu + 40, t2)[1] - waterDisp(bv0, bu - 40, t2)[1]) / 80;
  const rockA = Math.sin(t2 * 2.1) * (0.03 + 0.16 * st) + slope * 0.8;
  const appear = ease.backOut(clamp((t2 - 30.2) / 0.8), 1.6);
  const after = smoothstep(CUE.apex, CUE.apex + 2.0, t);
  for (const refl of [true, false]) {
    for (const g of [lg, wg]) {
      setM(g, LM(cam, 1));
      g.translate(bu, L.v + bob + (refl ? 4 : 0));
      if (refl) g.scale(1, -0.75);
      g.rotate(rockA * (refl ? -1 : 1));
      g.scale(appear, appear);
    }
    const a = refl ? 0.35 * (1 - st * 0.6) : 1;
    // hull: a long low crescent
    const hull = [];
    for (let i = 0; i <= 20; i++) {
      const x = -150 + i * 15;
      const y = -6 + Math.pow(Math.abs(x) / 150, 3) * -26;
      hull.push([x, y]);
    }
    const bottom = [];
    for (let i = 20; i >= 0; i--) {
      const x = -150 + i * 15;
      bottom.push([x * 0.92, 16 - Math.pow(Math.abs(x) / 150, 2) * 14]);
    }
    washPoly(wg, hull.concat(bottom), { color: C.ink, alpha: 0.7 * a, layers: 2, jit: 2, seed: 1601 });
    pencil(lg, hull, { w: 3.2, color: C.ink, alpha: 0.9 * a, seed: 1602, boil, wob: 0.8, taper: [6, 6] });
    // black awning (篷)
    const aw = [];
    for (let i = 0; i <= 14; i++) {
      const an = Math.PI + (i / 14) * Math.PI;
      aw.push([-30 + Math.cos(an) * 62, -8 + Math.sin(an) * 44]);
    }
    washPoly(wg, aw.concat([[32, -6], [-92, -6]]), { color: C.ink, alpha: 0.75 * a, layers: 2, jit: 2, seed: 1603 });
    pencil(lg, aw, { w: 2.6, color: C.ink, alpha: 0.9 * a, seed: 1604, boil, wob: 0.8, taper: [5, 5] });
    for (let k = 1; k < 4; k++) {
      const x = -92 + k * 31;
      ribbon(lg, [[x, -8], [x + 2, -8 - Math.sqrt(Math.max(0, 1 - Math.pow((x + 30) / 62, 2))) * 44]], { w: 1.4, color: C.paper, alpha: 0.6 * a, seed: 1605 + k, boil, wob: 0.4, pressure: 0, taper: [2, 2] });
    }
    // lantern on a short pole at the stern: lit on the loudness peak at dusk
    const lit = ease.backOut(clamp((t2 - CUE.peakD) / 0.5), 2.2) * (1 - after * 0.6);
    pencil(lg, [[-128, -10], [-136, -70], [-120, -78]], { w: 2.2, color: C.ink, alpha: 0.9 * a, seed: 1620, boil, wob: 0.3, pressure: 0, taper: [2, 2] });
    if (lit > 0) {
      const sw = Math.sin(t2 * 2.6) * 4 + st * Math.sin(t2 * 6) * 6;
      wash(wg, -120 + sw, -64, 11 * lit, 14 * lit, { color: C.vermilion, alpha: 0.95 * a, layers: 3, seed: 1621, boil: Math.floor(boil / 2), rough: 0.1 });
      wash(wg, -120 + sw, -64, 46 * lit, 46 * lit, { color: C.ochre, alpha: 0.18 * a, layers: 2, seed: 1622, boil: Math.floor(boil / 3), edge: 0 });
    }
    // the figure at the bow; after the storm the umbrella is tipped back over the shoulder
    const close = 0;
    const lean = after;
    for (const g of [lg, wg]) { g.save(); g.translate(78, -8); }
    const ph = Math.sin(t2 * 1.4) * 0.05;
    pencil(lg, [[0, 0], [2, -40]], { w: 5, color: C.ink, alpha: 0.95 * a, seed: 1610, boil, wob: 0.4, pressure: 0 });
    lg.beginPath(); lg.arc(3, -50, 7.5, 0, TAU); lg.fillStyle = rgba(C.ink, 0.95 * a); lg.fill();
    pencil(lg, [[-2, -2], [16, -4], [20, 2]], { w: 3.4, color: C.ink, alpha: 0.9 * a, seed: 1611, boil, wob: 0.4, pressure: 0 });
    const tilt = -0.25 + ph - st * Math.sin(t2 * 3.3) * 0.25 - lean * 0.75;
    lg.rotate(tilt); wg.rotate(tilt);
    pencil(lg, [[6, -28], [6, -98]], { w: 2.2, color: C.ink, alpha: 0.9 * a, seed: 1612, boil, wob: 0.3, pressure: 0 });
    const spread = lerp(1, 0.28, ease.backIn(close));
    const canopy = [];
    for (let k = 0; k <= 16; k++) {
      const an = Math.PI + (k / 16) * Math.PI;
      canopy.push([6 + Math.cos(an) * 54 * spread, -92 + Math.sin(an) * 28 * (1 + (1 - spread) * 1.4)]);
    }
    wash(wg, 6, -106 - (1 - spread) * 12, 52 * spread, 19 + (1 - spread) * 16, { color: C.vermilion, alpha: 0.92 * a, layers: 3, seed: 1613, boil: Math.floor(boil / 2), rough: 0.1 });
    pencil(lg, canopy, { w: 2.6, color: C.ink, alpha: 0.9 * a, seed: 1614, boil, wob: 0.6, taper: [6, 6] });
    for (const g of [lg, wg]) g.restore();
  }
  // wake: two lines opening behind the stern
  setM(lg, LM(cam, 1));
  const speed = Math.abs(boatPos(t2 + 0.5)[0] - boatPos(t2 - 0.5)[0]);
  const wk = (1 - storm(t)) * appear * clamp((speed - 25) / 60) * (1 - smoothstep(CUE.swell, CUE.apex + 0.6, t));
  if (wk > 0.05) {
    for (const sg of [-1, 1]) {
      const pts = [];
      for (let q = 0; q <= 8; q++) {
        const f = q / 8;
        const u = bu - 150 - f * 320 * clamp(speed / 80);
        pts.push([u, bv0 + bob + 10 + sg * f * 34 + Math.sin(f * 9 - t2 * 4) * 3]);
      }
      ribbon(lg, pts, { w: 1.8, color: C.graphite, alpha: 0.6 * wk, seed: 1630 + sg, boil, wob: 1, taper: [6, 60], pressure: 0, step: 6 });
    }
    // lantern reflection: a broken vertical streak in the water
    const lit = clamp((t2 - CUE.peakD) / 0.5) * (1 - smoothstep(CUE.apex, CUE.apex + 2, t));
    if (lit > 0) {
      for (let q = 0; q < 7; q++) {
        const y = bv0 + bob + 30 + q * 22;
        const dx = Math.sin(t2 * 3 + q * 1.7) * 8;
        ribbon(wg, [[bu - 130 + dx - 10 + q, y], [bu - 130 + dx + 10 - q, y]], { w: 5 - q * 0.5, color: C.ochre, alpha: 0.7 * lit * (1 - q / 8), seed: 1640 + q, boil, wob: 0.5, pressure: 0, taper: [3, 3] });
      }
    }
  }
  for (const g of [lg, wg]) g.setTransform(1, 0, 0, 1, 0, 0);
}

// ---------------------------------------------------------------- storm: rain, clouds over the moon, lightning, foam
export function drawStorm(lg, wg, hg, cam, t, t2, boil) {
  const st = storm(t);
  if (st <= 0.001 && inhale(t) <= 0) return;
  const cl = { u: cam.y - P[1], v: P[0] - cam.x };
  const [mu, mv] = moonPos(cam);
  const fl = flash(t);
  // storm clouds roll across the moon, then part on the inhale
  setM(wg, LM(cam, 1));
  wg.save();
  clipOutsideBloom(wg, mu, mv, clearR(t), t);
  const part = smoothstep(CUE.swell - 0.3, CUE.apex, t);
  for (let i = 0; i < 5; i++) {
    const R = rng(1700 + i);
    const k = (t - CUE.climax) * (40 + R() * 40);
    const cu = mu - 700 + R() * 300 + k + (i % 2 ? -1 : 1) * part * 900;
    const cv = mv - 140 + R() * 280;
    const r = 230 + R() * 200;
    wash(wg, cu, cv, r, r * 0.38, { color: C.indigo, alpha: 0.42 * st * (1 - fl * 0.9), layers: 3, seed: 1710 + i, boil: Math.floor(boil / 3), rough: 0.4, edge: 0.4 });
  }
  wg.restore();
  setM(lg, LM(cam, 1));
  setM(hg, LM(cam, 1));
  // rain: graphite streaks and white gouache streaks, driven by the wind
  const R = rng(5150);
  const n = Math.floor(260 * st);
  for (let i = 0; i < n; i++) {
    const v0 = R() * 2600, sp = 2000 + R() * 900, len = 70 + R() * 150;
    const ph = R() * 10;
    const white = R() < 0.45;
    const vv = ((v0 + sp * (t2 + ph)) % 2600) + cl.v - 1300;
    const uu = ((R() * 2600 + (t2 + ph) * sp * 0.5) % 2600) + cl.u - 1300;
    const g = white ? hg : lg;
    ribbon(g, [[uu, vv], [uu + len * 0.5, vv + len]], { w: (white ? 1.8 : 1.3) + R(), color: white ? C.paper : C.graphite, alpha: (white ? 0.55 : 0.4) * st * (white ? 1 : 1 - fl), seed: i, boil, wob: 0.4, taper: [len * 0.7, 3], pressure: 0, step: 8 });
  }
  // lightning: one ink stroke, branching, while the page flashes white
  for (const tl of LIGHTNING) {
    const k = t - tl;
    if (k < -0.034 || k > 0.25) continue;
    const Rl = rng(Math.floor(tl * 100));
    let u = mu + 300 + Rl() * 260, v = mv - 260;
    const pts = [[u, v]];
    while (v < HORIZON_V - 10) {
      u += (Rl() - 0.45) * 90;
      v += 40 + Rl() * 50;
      pts.push([u, Math.min(v, HORIZON_V - 10)]);
    }
    const a = k < 0.1 ? 1 : 1 - (k - 0.1) / 0.15;
    ribbon(lg, pts, { w: 6, color: C.ink, alpha: a, seed: tl, boil, wob: 1, taper: [20, 40], pressure: 0.2, step: 5 });
    const b = pts.slice(2, 5).map(([x, y], j) => [x + j * 40 + 20, y + j * 30]);
    ribbon(lg, [pts[2], ...b], { w: 3, color: C.ink, alpha: a * 0.8, seed: tl + 1, boil, wob: 1, taper: [10, 20], step: 5 });
  }
  // white foam and spray: from each strummed line and each folding crest
  for (const s of STRUMS) {
    const k = t2 - s.t;
    if (k < 0 || k > 0.9 || s.t < CUE.climax + 2) continue;
    const Rs = rng(Math.floor(s.t * 1000));
    for (let i = 0; i < 16 * s.a; i++) {
      const v0 = HORIZON_V + 120 + Rs() * 600;
      const u0 = s.u + (Rs() - 0.5) * s.width * 1.8;
      const vel = 400 + Rs() * 700;
      const ang = -Math.PI / 2 + (Rs() - 0.5) * 1.2;
      const uu = u0 + Math.cos(ang) * vel * k * 0.7;
      const vv = v0 + waterDisp(v0, u0, s.t)[1] + Math.sin(ang) * vel * k + 0.5 * 2600 * k * k;
      const r = 3 + Rs() * 6;
      const fade = 1 - k / 0.9;
      hg.beginPath();
      hg.ellipse(uu, vv, r, r * (1.2 + vel * 0.0006), ang, 0, TAU);
      hg.fillStyle = rgba(C.paper, 0.8 * fade);
      hg.fill();
    }
  }
  for (const wv of WAVES) {
    const k = t2 - wv.t - 0.3;
    if (k < -0.3 || k > 1.3) continue;
    const Rb = rng(Math.floor(wv.t * 1000) + 9);
    // foam along the crest of the top few rising lines
    for (const L of LINES) {
      const d = clamp((L.v - HORIZON_V) / 800);
      if (d < 0.25) continue;
      const sh = waveShape(wv, L.v, wv.u, t2);
      if (sh.A < 60) continue;
      for (let i = 0; i < 4; i++) {
        const u = sh.uc + (Rb() * 0.6 - 0.1) * sh.wb;
        const [du, dv] = waterDisp(L.v, u, t2, L.phase);
        flick(hg, u + du, L.v + dv - 2, -Math.PI / 2 + 0.6 + Rb() * 0.8, 14 + Rb() * 22, 6 + Rb() * 5, { color: C.paper, alpha: 0.75 * clamp(sh.A / 150), seed: L.j * 10 + i, boil, bend: 0.3 });
      }
    }
    if (k > 0) {
      for (let i = 0; i < 30 * wv.s; i++) {
        const v0 = HORIZON_V + 300 + Rb() * 450;
        const sh = waveShape(wv, v0, wv.u, wv.t + 0.3);
        const crest = v0 - sh.dv;
        const ang = -Math.PI / 2 + 0.6 + (Rb() - 0.5) * 1.6;
        const sp = 350 + Rb() * 650;
        const px = (sh.uc || wv.u) + sh.du + (Rb() - 0.3) * 120 + Math.cos(ang) * sp * k, py = crest + Math.sin(ang) * sp * k + 0.5 * 2400 * k * k;
        const r = 3 + Rb() * 7;
        hg.beginPath();
        hg.ellipse(px, py, r, r * 1.3, ang, 0, TAU);
        hg.fillStyle = rgba(C.paper, 0.85 * (1 - k / 1.3));
        hg.fill();
      }
    }
  }
  for (const g of [lg, wg, hg]) g.setTransform(1, 0, 0, 1, 0, 0);
}

// ---------------------------------------------------------------- calm river life: geese, reeds, wake, lantern
export function drawGeese(lg, cam, t, t2, boil) {
  if (t < 31.2 || t > 38.5) return;
  setM(lg, LM(cam, 0.3));
  const cl = { u: (cam.y - P[1]) * 0.3, v: (P[0] - cam.x) * 0.3 };
  const k = t2 - 31.2;
  const a = smoothstep(0, 0.6, k) * (1 - smoothstep(6.4, 7.3, k));
  const lead = [cl.u + 760 - k * 165, HORIZON_V - 420 + k * 18];
  for (let i = 0; i < 7; i++) {
    const side = i % 2 ? 1 : -1, rank = Math.ceil(i / 2);
    const bu = lead[0] + rank * 46, bv = lead[1] + side * rank * 26 + Math.sin(t2 * 2 + i) * 3;
    const flap = Math.sin(t2 * 9 + i * 0.9);
    const s = 1 - rank * 0.06;
    const wing = 15 * s, lift = flap * 8 * s;
    ribbon(lg, [[bu - wing, bv - lift], [bu - 4, bv + 2], [bu, bv]], { w: 2.4, color: C.ink, alpha: 0.85 * a, seed: 1800 + i, boil, wob: 0.3, taper: [3, 2], pressure: 0, step: 2 });
    ribbon(lg, [[bu, bv], [bu + 5, bv + 2], [bu + wing * 0.9, bv - lift * 1.1]], { w: 2.4, color: C.ink, alpha: 0.85 * a, seed: 1810 + i, boil, wob: 0.3, taper: [2, 3], pressure: 0, step: 2 });
  }
}

export function drawReeds(lg, wg, cam, t, t2, boil) {
  if (t < 28.9 || t > 70) return;
  setM(lg, LM(cam, 1.5));
  const R0 = rng(1900);
  const st = storm(t);
  const grow = curve.stroke(clamp((t2 - 29.3) / 1.1));
  for (let c = 0; c < 6; c++) {
    const cu = -820 + c * 760 + R0() * 260;
    const n = 6 + Math.floor(R0() * 5);
    for (let i = 0; i < n; i++) {
      const R = rng(1950 + c * 20 + i);
      const bu = cu + (R() - 0.5) * 120, bv = 980;
      const h = (300 + R() * 260) * grow;
      const wnd = Math.sin(t2 * 1.3 + bu * 0.01) * 0.08 + st * (0.35 + 0.2 * Math.sin(t2 * 5 + i)) + noise1(t2 * 0.8 + i, c) * 0.1;
      const pts = [];
      for (let q = 0; q <= 10; q++) {
        const f = q / 10;
        const bend = (wnd + 0.06 * (R() - 0.5)) * f * f * h;
        pts.push([bu + bend + (R() - 0.5) * 2, bv - f * h]);
      }
      ribbon(lg, pts, { w: 3.2 + R() * 1.4, color: C.ink, alpha: 0.88, seed: 1960 + c * 20 + i, boil, wob: 0.7, taper: [4, 30], pressure: 0, step: 6 });
      if (R() < 0.6 && grow > 0.8) {
        const [tx, ty] = pts[10];
        flick(lg, tx, ty + 10, -Math.PI / 2 + wnd * 2 + 0.3, 46 + R() * 30, 12, { color: mixc(C.ink, C.ochre, 0.3), alpha: 0.85, seed: c * 20 + i, boil, bend: 0.2 });
      }
    }
  }
}

// ---------------------------------------------------------------- dusk: a vermilion sun setting behind the far ridge
export function drawSun(lg, wg, cam, t, t2, boil) {
  if (t < ROLL.land - 0.2 || t > 37.2) return;
  const camU = cam.y - P[1], camV = P[0] - cam.x;
  const ref = 31;
  const cr = camLocal(ref);
  const p = 0.15;
  const su = cr.u + 250 + (camU - cr.u) * (1 - p);
  const sv0 = HORIZON_V - 170 + (t - 29) * 24;
  const sv = sv0 + (camV - cr.v) * (1 - p);
  const r = 62;
  const appear = ease.backOut(clamp((t2 - 29.37) / 0.6), 1.5);
  const a = clamp((37.0 - t) / 0.8);
  // the horizon, and the far ridge once the pen has drawn it, hide the lower part of the sun
  const ridgeShift = camU * 0.62;
  const uEnd = ridgeProgress(t2);
  for (const g of [lg, wg]) {
    setM(g, LM(cam, 1));
    g.save();
    g.beginPath();
    g.moveTo(su - 400, HORIZON_V - 1200);
    g.lineTo(su + 400, HORIZON_V - 1200);
    for (let u = su + 400; u >= su - 400; u -= 8) {
      const ru = u - ridgeShift;
      g.lineTo(u, ru <= uEnd ? ridgeV(ru) : HORIZON_V - 2);
    }
    g.closePath();
    g.clip();
  }
  wash(wg, su, sv, r * appear, r * appear, { color: C.vermilion, alpha: 0.62 * a, layers: 4, seed: 2101, boil: Math.floor(boil / 3), rough: 0.06, edge: 0.4 });
  wash(wg, su, sv, r * 2.6 * appear, r * 2.2 * appear, { color: C.ochre, alpha: 0.16 * a, layers: 3, seed: 2102, boil: Math.floor(boil / 4), rough: 0.2, edge: 0 });
  const pts = [];
  for (let k = 0; k <= 64; k++) { const an = -1.9 + (k / 64) * (TAU + 0.3); pts.push([su + Math.cos(an) * r, sv + Math.sin(an) * r]); }
  pencil(lg, pts, { w: 2.2, color: C.ink, alpha: 0.75 * a, from: 0, to: curve.stroke(clamp((t2 - 29.3) / 0.55)), seed: 2103, boil, wob: 1.2, taper: [10, 20] });
  for (const g of [lg, wg]) g.restore();
  // its road on the water: short vermilion dashes, shorter as the light goes
  setM(wg, LM(cam, 1));
  for (const L of LINES) {
    if (L.v < HORIZON_V + 3 || L.v > HORIZON_V + 520) continue;
    const d = (L.v - HORIZON_V) / 520;
    const R = rng(L.j * 7 + 3);
    const half = (60 - d * 40) * (0.6 + R() * 0.6) * appear * a * clamp((HORIZON_V - sv) / 140 + 0.2);
    if (half < 2) continue;
    const du = Math.sin(t2 * 2.3 + L.j) * 6;
    const y = L.v + waterDisp(L.v, su + du, t2, L.phase)[1] - 3;
    ribbon(wg, [[su + du - half, y], [su + du + half, y]], { w: 4 - d * 2, color: C.vermilion, alpha: 0.55 * (1 - d * 0.6), seed: 2110 + L.j, boil, wob: 0.6, taper: [6, 6], pressure: 0 });
  }
}

// ---------------------------------------------------------------- the leaves stripped from the grove land on the water
export function drawFloatingLeaves(lg, cam, t, t2, boil) {
  if (t < ROLL.land - 0.1 || t > 46) return;
  setM(lg, LM(cam, 1));
  const base = camLocal(ROLL.land + 0.4);
  const fade = 1 - smoothstep(44.0, 45.5, t);
  for (let i = 0; i < 11; i++) {
    const R = rng(2200 + i);
    const L = LINES[3 + Math.floor(R() * (LINES.length - 4))];
    const land = ROLL.land + 0.05 + R() * 0.9;
    const k = t2 - land;
    const u0 = base.u - 520 + R() * 1040;
    let u, v, ang = R() * TAU;
    if (k < 0) {
      // falling the last part of the way, tumbling
      const f = clamp(-k / 0.7);
      u = u0 - f * 160;
      v = L.v - f * f * 700;
      ang += f * 9;
      if (v < L.v - 650) continue;
    } else {
      u = u0 + k * (10 + R() * 14);
      v = L.v + waterDisp(L.v, u, t2, L.phase)[1] - 2;
      ang += Math.sin(t2 * 0.8 + i) * 0.25 + k * 0.05;
    }
    flick(lg, u, v, ang, 52 + R() * 26, 11 + R() * 4, { color: mixc(C.ink, C.celadonDeep, 0.3 + R() * 0.4), alpha: 0.85 * fade, seed: 2210 + i, boil, bend: 0.15 });
    // a ring where it touched down
    if (k > 0 && k < 1.2) {
      const rr = 10 + k * 70;
      lg.beginPath();
      lg.ellipse(u0, L.v, rr, rr * 0.18, 0, 0, TAU);
      lg.strokeStyle = rgba(C.graphite, 0.5 * (1 - k / 1.2));
      lg.lineWidth = 1.5;
      lg.stroke();
    }
  }
}

// ---------------------------------------------------------------- coda: a band of mist drifting across the far ridge
export function drawMist(wg, cam, t, t2, boil) {
  if (t < CUE.calm || t > 70) return;
  setM(wg, LM(cam, 1));
  const camU = cam.y - P[1];
  const a = smoothstep(CUE.calm, CUE.calm + 2, t);
  for (let i = 0; i < 3; i++) {
    const u = camU - 900 + i * 700 + (t - CUE.calm) * (22 + i * 8);
    wash(wg, u, HORIZON_V - 60 - i * 40, 420, 46, { color: C.celadon, alpha: 0.14 * a, layers: 3, seed: 2300 + i, boil: Math.floor(boil / 6), rough: 0.3, edge: 0 });
  }
}

// ---------------------------------------------------------------- the last string: ghosts + twang marks, as in the opening
export function drawHorizonString(lg, cam, t, t2, boil) {
  if (t < CUE.apex) return;
  setM(lg, LM(cam, 1));
  for (const p of HPLUCKS) {
    const tau = t2 - p.t;
    if (tau < 0 || tau > 1.2) continue;
    const env = p.a * 1.15 * Math.exp(-tau / 0.35);
    if (env > 1.2) {
      for (const sg of [-1, 1]) {
        const pts = [];
        for (let u = p.u0; u <= p.u1; u += 20) {
          const x = (u - p.u0) / (p.u1 - p.u0);
          pts.push([u, HORIZON_V + sg * env * Math.sin(Math.PI * x)]);
        }
        ribbon(lg, pts, { w: 1.3, color: C.graphite, alpha: 0.35 * clamp(env / 8), seed: 2400 + sg, boil, wob: 1.8, taper: [80, 80], pressure: 0, step: 10 });
      }
    }
    if (tau < 0.42 && p.a >= 6) {
      const u = (p.u0 + p.u1) / 2 + (p.u1 - p.u0) * 0.18;
      const k = tau / 0.42;
      for (const sg of [-1, 1]) for (let j = 0; j < 3; j++) {
        const off = 16 + j * 12 + ease.expoOut(k) * 26;
        const len = (30 - j * 8) * (1 - k * 0.4) * Math.min(1.2, p.a / 12);
        const pts = [];
        for (let q = 0; q <= 6; q++) { const v = q / 6 - 0.5; pts.push([u + v * len * 2, HORIZON_V + sg * (off + Math.cos(v * 2.4) * 6)]); }
        ribbon(lg, pts, { w: 2.2, color: C.ink, alpha: 0.75 * (1 - k), seed: 2410 + j + sg, boil, wob: 0.8, taper: [8, 8] });
      }
    }
  }
}
