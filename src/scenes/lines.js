// The line family that carries the middle of the film:
// frozen rain -> bamboo stalks -> (the sketchbook is turned 90°) -> water lines -> strings again.
// Everything here is drawn in RIVER-LOCAL coordinates: u along a line, v across it.
// local -> world: x = P.x - v, y = P.y + u. Before the turn the camera is upright, so lines stand vertical
// (-u is up the stalk); after it the camera is rolled -90°, so the same lines lie flat (+v is down, v<HORIZON is sky).
import { clamp, lerp, smoothstep, ease, curve, noise1, fbm1, h01, rng, TAU, rgba, mixc, springImpulse } from '../lib/util.js';
import { ribbon, flick, wash, fillPts } from '../lib/draw.js';
import { C, CUE, S, M, setM, mul } from '../core.js';

export const P = [3200, 1650]; // roll pivot (world)
export const R90 = [0, 1, -1, 0, P[0], P[1]];
export const HORIZON_V = -70;
export const ROLL = { start: 26.87, swing: 27.3, land: 28.54, settle: 29.3 };
const BASE_U = 2460 - P[1]; // bamboo foot (canal bank)
const TOP_U = -2300;

export const LM = (cam, p = 1) => mul(M(cam, p, P), R90);
// morph: 0 bamboo, 1 water line
export const morph = (t) => smoothstep(ROLL.swing - 0.1, ROLL.land + 0.45, t);

export let STALKS = [], LINES = [], FAR = [], NEAR = [];

export const night = (t) => smoothstep(31.5, 42.5, t);
export const storm = (t) => smoothstep(CUE.climax, 47.0, t) * (1 - smoothstep(CUE.apex, CUE.apex + 0.6, t));
// the swell before the apex: everything is drawn in toward the horizon
export const inhale = (t) => smoothstep(CUE.swell, CUE.apex, t) * (1 - smoothstep(CUE.apex, CUE.apex + 0.25, t));
export const LIGHTNING = [51.27, 54.242];
export function flash(t) {
  let f = 0;
  for (const tl of LIGHTNING) {
    const k = t - tl;
    if (k >= -0.034 && k < 0.6) f = Math.max(f, k < 0.07 ? 1 : Math.exp(-(k - 0.07) / 0.09));
  }
  return f;
}

export function buildLines() {
  const R = rng(3131);
  // ---- bamboo (mid layer, on the paper plane)
  const V = [2250, 2030, 1840, 1580, 1350, 1160, 950, 790, 600, 430, 300, 150, 40];
  STALKS = V.map((v, k) => {
    const w = v < 200 ? 13 + R() * 4 : 19 + R() * 13;
    const nodes = [];
    let u = BASE_U + 30;
    while (u > TOP_U) { nodes.push(u); u -= 165 + R() * 70; }
    const clusters = [];
    for (let i = 2; i < nodes.length; i++) {
      const un = nodes[i];
      if (un < -1300 || un > 420) continue;
      if (R() < 0.62) {
        clusters.push({
          node: i, side: R() < 0.5 ? -1 : 1, twig: 50 + R() * 110, n: 4 + Math.floor(R() * 5),
          seed: k * 100 + i, dark: R() < 0.65,
        });
      }
    }
    const enter = k < 3 ? CUE.bamboo + 0.6 : camEnterTime(v);
    clusters.forEach((c, i) => { c.t0 = snapBeat(Math.max(enter - 0.2, 15.9) + i * 0.21 + R() * 0.15); });
    return {
      k, v, w, nodes, clusters, lean: (R() - 0.5) * 0.11, tone: R(), seed: 70 + k * 13,
      grow: k < 3 ? CUE.bamboo + 0.04 + k * 0.17 : 15.4, seedU: -380 + R() * 700, fallSpeed: 2100 + R() * 700,
      water: v < 650,
    };
  });
  // ---- water lines: those born from stalks + new ones the pen adds after the turn
  LINES = [];
  for (const s of STALKS) if (s.water) LINES.push({ v: s.v, stalk: s });
  const NEWV = [-70, -61, -50, -36, -18, 4, 80, 105, 215, 365, 515, 700, 860];
  NEWV.forEach((v, i) => LINES.push({ v, draw: ROLL.land - 0.05 + (i === 0 ? 0 : 0.18 + i * 0.11) }));
  LINES.sort((a, b) => a.v - b.v);
  LINES.forEach((L, j) => { L.j = j; L.seed = 500 + j * 17; L.phase = R() * TAU; });
  // ---- far grove (pale), and out-of-focus leaves in front
  FAR = [];
  for (let k = 0; k < 30; k++) FAR.push({ v: 120 + R() * 2900, w: 5 + R() * 9, seed: 900 + k, leafU: -900 + R() * 900, side: R() < 0.5 ? -1 : 1 });
  NEAR = [];
  for (let k = 0; k < 5; k++) NEAR.push({ v: 600 + k * 640 + R() * 220, u: -720 + R() * 260, seed: 950 + k, n: 6 + Math.floor(R() * 4), side: k % 2 ? 1 : -1 });
}

// when the camera first frames local v (bamboo phase, approx) - so leaves are drawn as they come into view
function camEnterTime(v) {
  // a stalk at world x enters from the right when the camera is ~560px to its left;
  // the camera glides 1640 -> 2560 between 16.6 s and 25.9 s
  const xs = P[0] - v;
  return 16.6 + clamp((xs - 560 - 1640) / 920) * 9.3;
}
function snapBeat(t) {
  const b = S.AUDIO.beats;
  let best = t;
  for (const x of b) if (Math.abs(x - t) < 0.22) { best = x; break; }
  return best;
}

// ---------------------------------------------------------------- wind
export function wind(t, v) {
  const tt = t + (v - HORIZON_V) * 0.00022; // gusts roll across the grove
  let w = fbm1(tt * 0.35, 41) * 0.3 + 0.12 * Math.sin(tt * 1.3 + v * 0.002);
  w += springImpulse(tt - CUE.gust1, 0.55, 1.5) * 1.3;
  w += springImpulse(tt - 18.692, 0.9, 2.4) * 0.45;
  w += springImpulse(tt - CUE.gust2, 0.5, 1.3) * 1.9;
  w += ease.cubicIn(clamp((tt - ROLL.start) / 0.5)) * (1 - smoothstep(ROLL.swing, ROLL.land, tt)) * 2.4;
  return w;
}
function sway(s, u, t) {
  const h = clamp((BASE_U - u) / (BASE_U - TOP_U));
  return wind(t, s.v) * 80 * h * h * (1 - morph(t));
}
// centre of a stalk at height u (local v)
function stalkV(s, u, t) {
  return s.v + s.lean * (BASE_U - u) * (1 - morph(t)) - sway(s, u, t);
}

// ---------------------------------------------------------------- water motion
export const STRUMS = [];
export const WAVES = [];
const depthOf = (v) => clamp((v - HORIZON_V) / 800);

// displacement of a water line at (u, v): returns [du, dv]
export function waterDisp(v, u, t, phase = 0) {
  const d = depthOf(v);
  const st = storm(t);
  let dv = Math.sin(u * 0.011 + t * 1.5 + phase) * (1.2 + 4.5 * d) + noise1(u * 0.004 + t * 0.3, Math.round(v)) * (2 + 7 * d);
  // choppy water in the storm
  dv += st * (noise1(u * 0.009 + t * 1.7, Math.round(v) + 7) * (8 + 30 * d) + Math.sin(u * 0.03 - t * 6 + phase) * (3 + 10 * d));
  let du = 0;
  for (const s of STRUMS) {
    const tau = t - s.t - d * 0.12; // the strum sweeps from the horizon toward us
    if (tau < 0 || tau > 3) continue;
    const x = u - s.u;
    dv += s.a * (5 + 24 * d) * Math.exp(-tau / s.decay) * Math.exp(-(x * x) / (2 * s.width * s.width)) * Math.cos(x * 0.018 - tau * 13);
  }
  // contour-line waves: every line rises together, the crest runs forward and folds over
  for (const w of WAVES) {
    const g = waveShape(w, v, u, t);
    dv -= g.dv;
    du += g.du;
  }
  // inhale: all lines are pulled up toward the horizon before the apex
  const inh = inhale(t);
  if (inh > 0) dv -= inh * (v - HORIZON_V) * 0.35;
  return [du, dv];
}

export function waveShape(w, v, u, t) {
  const tau = t - w.t;
  if (tau < -0.4 || tau > 2.4) return { dv: 0, du: 0, A: 0 };
  const d = depthOf(v);
  const rise = tau < 0 ? ease.cubicIn((tau + 0.4) / 0.4) * 0.3 : 0.3 + 0.7 * ease.expoOut(clamp(tau / 0.35));
  const fall = 1 - ease.cubicIn(clamp((tau - 0.7) / 1.6));
  const A = w.s * 330 * rise * fall * (0.3 + 0.7 * d);
  const uc = w.u + 160 * Math.max(0, tau) * w.s + (1 - d) * 220 * w.s;
  const wb = (150 + 170 * d) * w.s;
  const x = u - uc;
  // gentle back, steep front
  const g = x < 0 ? Math.exp(-(x * x) / (2 * wb * wb)) : Math.exp(-(x * x) / (2 * (wb * 0.38) ** 2));
  // the crest is thrown forward: an overhang that grows as the wave breaks
  const curl = A * 0.75 * Math.pow(g, 4) * clamp(tau / 0.55 + 0.2);
  return { dv: A * g, du: curl, A, uc, wb };
}

// ---------------------------------------------------------------- render: bamboo
function stalkColor(s) {
  return mixc(C.ink, C.celadonDeep, 0.25 + s.tone * 0.4);
}

export function drawLines(lg, wg, cam, t, t2, boil, extra = {}) {
  if (t < CUE.toBamboo || t > 70) return;
  const m = morph(t);
  if (t < ROLL.land + 0.8) drawGrove(lg, wg, cam, t, t2, boil, m);
  if (t > ROLL.swing) drawWater(lg, wg, cam, t, t2, boil, m, extra);
}

function drawGrove(lg, wg, cam, t, t2, boil, m) {
  // far grove: pale ink stalks + leaf masses in wash, on a slower plane
  const fa = ease.cubicOut(clamp((t - 15.0) / 1.8)) * (1 - smoothstep(ROLL.swing - 0.2, ROLL.land - 0.3, t));
  if (fa > 0) {
    setM(wg, LM(cam, 0.55));
    for (const F of FAR) {
      const sw = wind(t2 - 0.3, F.v) * 35;
      const pts = [];
      for (let u = BASE_U + 200; u > TOP_U; u -= 70) {
        const h = clamp((BASE_U - u) / (BASE_U - TOP_U));
        pts.push([u, F.v - sw * h * h]);
      }
      ribbon(wg, pts, { w: F.w, color: C.celadon, alpha: 0.5 * fa, seed: F.seed, boil: Math.floor(boil / 2), wob: 1.5, taper: [60, 60], pressure: 0, step: 12 });
      const h = clamp((BASE_U - F.leafU) / (BASE_U - TOP_U));
      wash(wg, F.leafU + 60, F.v - sw * h * h - F.side * 70, 110, 70, { color: C.celadon, alpha: 0.28 * fa, layers: 3, seed: F.seed + 1, boil: Math.floor(boil / 4), rough: 0.4, edge: 0.2 });
    }
    // mist bands drifting through the grove
    for (let i = 0; i < 4; i++) {
      const u = -560 + i * 330 + Math.sin(t * 0.2 + i) * 30;
      wash(wg, u, 1500 - i * 300 + t2 * 14, 60, 1000, { color: C.celadon, alpha: 0.12 * fa, layers: 3, seed: 980 + i, boil: Math.floor(boil / 6), rough: 0.25, edge: 0 });
    }
  }
  setM(lg, LM(cam, 1));
  setM(wg, LM(cam, 1));
  const fall = 1 - ease.cubicOut(clamp((t2 - CUE.toBamboo) / 1.3));
  for (const s of STALKS) {
    if (!s.water && m > 0.6) continue;
    const vis = s.water ? 1 - smoothstep(0.55, 1, m) : 1 - smoothstep(ROLL.swing - 0.3, ROLL.land - 0.4, t);
    if (vis <= 0) continue;
    if (t2 < s.grow) {
      // a rain streak that slows down and stops: the seed of the stalk
      const rtNow = t2 < CUE.toBamboo ? (t2 - CUE.toBamboo) : (1.3 * (1 - Math.pow(1 - clamp((t2 - CUE.toBamboo) / 1.3), 4))) / 4;
      const u0 = s.seedU - s.fallSpeed * (1.3 / 4 - rtNow);
      const len = 60 + 50 * fall;
      ribbon(lg, [[u0 - len, s.v + len * 0.14], [u0, s.v]], { w: 2.2, color: C.graphite, alpha: 0.85, seed: s.seed, boil, wob: 0.4, taper: [len * 0.7, 3], pressure: 0 });
      continue;
    }
    const grow = curve.stroke(clamp((t2 - s.grow) / 1.0));
    const widen = ease.backOut(clamp((t2 - s.grow - 0.25) / 0.8), 1.3);
    const uTop = lerp(s.seedU - 80, TOP_U, grow), uBot = lerp(s.seedU, BASE_U + 60, grow);
    const wB = lerp(2.2, s.w, widen);
    const wW = lerp(1.6, 3.2, depthOf(s.v));
    const w = lerp(wB, wW, m);
    const col = stalkColor(s);
    const N = s.nodes;
    // one brush segment per internode: blunt ends, slightly waisted, a gap at each node
    for (let k = 0; k < N.length - 1; k++) {
      const a = N[k], b = N[k + 1];
      if (b > uBot || a < uTop) continue;
      const g = lerp(5 + w * 0.12, 0, m);
      const ua = Math.min(a, uBot) - g, ub = Math.max(b, uTop) + g;
      const pts = [];
      for (let u = ua; u >= ub; u -= 14) pts.push([u, stalkV(s, u, t2)]);
      pts.push([ub, stalkV(s, ub, t2)]);
      if (pts.length < 2) continue;
      ribbon(lg, pts, { w, color: col, alpha: 0.9 * vis * (1 - m * 0.15), seed: s.seed + k * 7, boil, wob: lerp(0.6, 1.4, m), taper: [lerp(2, 20, m), lerp(2, 20, m)], pressure: 0.12, step: 7 });
      if (m < 0.9 && w > 8) {
        // a lighter stroke down one side: the round of the stalk
        ribbon(wg, pts.map(([u, v]) => [u, v - w * 0.18]), { w: w * 0.45, color: C.celadon, alpha: 0.55 * (1 - m) * vis, seed: s.seed + k, boil: Math.floor(boil / 2), wob: 0.4, taper: [3, 3], pressure: 0, step: 10 });
      }
    }
    // node marks: a short hooked stroke bridging each gap, erased as the page turns
    const nodeA = clamp((t2 - s.grow - 0.45) / 0.35) * (1 - smoothstep(ROLL.swing - 0.25, ROLL.land - 0.45, t2)) * vis;
    if (nodeA > 0 && w > 6) {
      for (let k = 0; k < N.length; k++) {
        const u = N[k];
        if (u > uBot || u < uTop) continue;
        const pop = ease.backOut(clamp((t2 - s.grow - 0.45 - k * 0.025) / 0.3), 2.2);
        const vc = stalkV(s, u, t2);
        const hw = (w * 0.5 + 3) * pop;
        ribbon(lg, [[u + 2, vc + hw], [u - 3, vc + hw * 0.3], [u - 2, vc - hw * 0.5], [u + 3, vc - hw]], { w: 3.4, color: C.ink, alpha: 0.85 * nodeA, seed: s.seed + k, boil, wob: 0.4, taper: [2, 4], pressure: 0.3, step: 3 });
      }
    }
    drawClusters(lg, wg, s, t, t2, boil, w);
  }
  drawFlurry(lg, wg, cam, t, t2, boil);
  // out-of-focus leaves sweeping across the foreground
  const na = ease.cubicOut(clamp((t - 16.0) / 1.0)) * (1 - smoothstep(25.8, 26.8, t));
  if (na > 0) {
    setM(wg, LM(cam, 1.7));
    wg.filter = 'blur(7px)';
    for (const Nn of NEAR) {
      const wd = wind(t2, Nn.v);
      for (let i = 0; i < Nn.n; i++) {
        const R = rng(Nn.seed * 10 + i);
        const a = -Nn.side * (0.3 + R() * 1.1) + noise1(t2 * 1.6 + i, Nn.seed) * 0.2 + wd * 0.15;
        flick(wg, Nn.u + wd * 20, Nn.v - wd * 30, a, 200 + R() * 120, 46 + R() * 16, { color: mixc(C.ink, C.celadonDeep, 0.5), alpha: 0.55 * na, seed: Nn.seed + i, boil: Math.floor(boil / 2), bend: 0.15 });
      }
    }
    wg.filter = 'none';
  }
}

// leaves torn off by the gusts, tumbling across the frame
function drawFlurry(lg, wg, cam, t, t2, boil) {
  for (const [tg, n, seed] of [[CUE.gust1 + 0.1, 8, 31], [CUE.gust2 + 0.05, 22, 37]]) {
    const k = t2 - tg;
    if (k < 0 || k > 3.2) continue;
    for (let i = 0; i < n; i++) {
      const R = rng(seed * 100 + i);
      const near = R() < 0.3;
      const p = near ? 1.5 : 1;
      const g = near ? wg : lg;
      const c0 = camLocalAt(tg);
      const kk = k - R() * 0.5;
      if (kk < 0) continue;
      // blown from screen-left to screen-right (local +v -> -v), drifting down (+u)
      const u = c0.u - 700 + R() * 1100 + kk * (90 + R() * 120) + Math.sin(kk * 3 + i) * 40;
      const v = c0.v + 700 - kk * (520 + R() * 380) * (near ? 1.5 : 1);
      const ang = R() * TAU + kk * (4 + R() * 6);
      setM(g, LM(cam, p));
      if (near) g.filter = 'blur(5px)';
      flick(g, u, v, ang, (near ? 150 : 80) + R() * 40, (near ? 34 : 16) + R() * 6, { color: mixc(C.ink, C.celadonDeep, 0.2 + R() * 0.5), alpha: (near ? 0.6 : 0.9) * clamp((3.2 - k) / 0.5), seed: seed + i, boil, bend: 0.2 * Math.sin(kk * 5 + i) });
      if (near) g.filter = 'none';
    }
  }
}
function camLocalAt(t) { return { u: 0, v: 0, ...CAMLOC(t) }; }
let CAMLOC = () => ({ u: 0, v: 0 });
export function setCamLocal(fn) { CAMLOC = fn; }

// a twig and a fan of leaves (个 / 介), drawn leaf by leaf; blown off before the page turns
function drawClusters(lg, wg, s, t, t2, boil, w) {
  const strip0 = ROLL.start + 0.05;
  for (const c of s.clusters) {
    if (t2 < c.t0) continue;
    const u0 = s.nodes[c.node];
    const v0 = stalkV(s, u0, t2);
    const wd = wind(t2 - 0.15, s.v);
    const ta = 0.8 - 0.18 * wd * c.side;
    const tg = curve.stroke(clamp((t2 - c.t0) / 0.35));
    const tl = c.twig * tg;
    const tu = u0 - Math.cos(ta) * tl, tv = v0 - c.side * Math.sin(ta) * tl;
    const strip = clamp((t2 - strip0 - (c.seed % 9) * 0.04) / 0.7);
    const twigA = 0.85 * (1 - smoothstep(ROLL.swing - 0.2, ROLL.land - 0.5, t2));
    if (twigA > 0) ribbon(lg, [[u0, v0], [(u0 + tu) / 2 - 4, (v0 + tv) / 2], [tu, tv]], { w: 1.6, color: C.graphite, alpha: twigA * 0.7, seed: c.seed, boil, wob: 0.5, taper: [2, 6], pressure: 0, step: 4 });
    for (let i = 0; i < c.n; i++) {
      const R = rng(c.seed * 10 + i);
      const lt = c.t0 + 0.12 + i * 0.05;
      const lp = curve.stroke(clamp((t2 - lt) / 0.22));
      if (lp <= 0) continue;
      // leaves fan downward (+u) and outward (-side*v)
      const spread = (i - (c.n - 1) / 2) / Math.max(1, c.n - 1);
      let a = -c.side * (0.45 + spread * 1.1 + R() * 0.2) + noise1(t2 * 2.4 + i, c.seed) * 0.12 + wd * 0.2 * -c.side * 0.5;
      const len = 85 + R() * 70;
      const wid = 15 + R() * 8;
      let lu = i % 3 === 0 ? (u0 + tu) / 2 : tu, lv = i % 3 === 0 ? (v0 + tv) / 2 : tv;
      let alpha = 0.92;
      if (strip > 0) {
        const k = strip;
        lu += -k * 420 * (0.4 + R()) + k * k * 200;
        lv += -k * k * 900 * (0.5 + R());
        a += k * 7 * (R() - 0.5);
        alpha *= 1 - ease.cubicIn(k);
      }
      if (alpha <= 0.01) continue;
      const dark = c.dark && i % 4 !== 3;
      flick(lg, lu, lv, a, len, wid, { color: dark ? mixc(C.ink, C.celadonDeep, 0.2 + R() * 0.2) : C.celadonDeep, alpha: alpha * (dark ? 1 : 0.7), seed: c.seed + i, boil, bend: 0.1 * c.side, to: lp });
    }
  }
}

// ---------------------------------------------------------------- render: water
function waterWidth(v) { return lerp(1.5, 3.4, depthOf(v)); }

function drawWater(lg, wg, cam, t, t2, boil, m, extra) {
  setM(lg, LM(cam, 1));
  setM(wg, LM(cam, 1));
  for (const w of WAVES) {
    const tau = t2 - w.t;
    if (tau < -0.4 || tau > 2.4) continue;
    for (const L of LINES) {
      const d = depthOf(L.v);
      if (d < 0.12) continue;
      const g0 = waveShape(w, L.v, w.u, t2);
      if (g0.A < 12) continue;
      const top = [], base = [];
      for (let x = -3.2; x <= 1.6; x += 0.1) {
        const u = g0.uc + x * g0.wb;
        const [du, dv] = waterDisp(L.v, u, t2, L.phase);
        top.push([u + du, L.v + dv]);
        base.push([u, L.v + 8]);
      }
      const poly = top.concat(base.reverse());
      fillPts(wg, poly);
      wg.fillStyle = rgba(C.indigo, 0.13 * clamp(g0.A / 120) * (extra.cr > 0 ? 0 : 1));
      wg.fill();
    }
  }
  const cr = extra.cr || 0;
  const calm = extra.calm || 0;
  const camU = cam.y - P[1];
  const U0 = camU - 1300, U1 = camU + 1300;
  for (const L of LINES) {
    // after the apex the clearing bloom washes every line away except the horizon - the last string
    let keep = 1;
    if (cr > 0 && L.j > 0) {
      const dist = Math.abs(L.v - extra.mv) * 0.9;
      keep = 1 - smoothstep(dist - 60, dist + 160, cr);
      if (keep <= 0) continue;
    }
    let from = U0, to = U1, alpha = 0.85;
    let w = waterWidth(L.v);
    if (L.stalk) {
      if (m < 0.55) continue; // the grove draws it until the morph is half way
      alpha *= smoothstep(0.55, 1, m);
    } else {
      // new lines: the pen draws them left to right after the turn
      const p = curve.stroke(clamp((t2 - L.draw) / 0.7));
      if (p <= 0) continue;
      to = lerp(U0 + 300, U1, p);
      from = U0;
    }
    if (L.j === 0) { w = 3.0; alpha = 0.95; }
    const R = rng(L.seed);
    // dashes: long strokes with gaps (fixed to the paper, so they slide by as we travel)
    let u = -2000 - R() * 300;
    while (u < U1) {
      const len = L.j === 0 ? 900 + R() * 900 : 160 + R() * 460;
      const gap = L.j === 0 ? 6 + R() * 20 : 24 + R() * 120;
      const a = Math.max(u, from), b = Math.min(u + len, to);
      if (b > a + 4 && b > U0 && a < U1) {
        const pts = [];
        for (let x = a; x <= b; x += 14) {
          const [du, dv] = waterDisp(L.v, x, t2, L.phase);
          pts.push([x + du, L.v + dv + stringDisp(L, x, t2)]);
        }
        const [du, dv] = waterDisp(L.v, b, t2, L.phase);
        pts.push([b + du, L.v + dv + stringDisp(L, b, t2)]);
        ribbon(lg, pts, { w, color: C.graphite, alpha: alpha * keep, seed: L.seed + Math.round(u), boil, wob: 1.3, taper: [14, 14], pressure: 0.15, step: 7 });
      }
      u += len + gap;
    }
    // vibration ghosts on a strummed line (the lens of a plucked string, as in the opening)
    for (const s of STRUMS) {
      const tau = t2 - s.t - depthOf(L.v) * 0.12;
      if (tau < 0 || tau > 0.6 || s.a < 0.8) continue;
      const env = s.a * (6 + 20 * depthOf(L.v)) * Math.exp(-tau / 0.25);
      if (env < 2) continue;
      for (const sg of [-1, 1]) {
        const pts = [];
        for (let x = s.u - s.width * 1.6; x <= s.u + s.width * 1.6; x += 24) {
          const g = Math.exp(-((x - s.u) ** 2) / (2 * s.width * s.width));
          const [du, dv] = waterDisp(L.v, x, t2, L.phase);
          pts.push([x + du, L.v + dv + sg * env * g * 1.2]);
        }
        ribbon(lg, pts, { w: 1.2, color: C.graphite, alpha: 0.35 * keep * (1 - tau / 0.6), seed: L.seed + sg, boil, wob: 1.6, taper: [60, 60], pressure: 0, step: 10 });
      }
    }
  }
}

// the horizon becomes a plucked string again at the end
export const HPLUCKS = [];
function stringDisp(L, u, t) {
  if (L.j !== 0 || !HPLUCKS.length) return 0;
  let d = 0;
  for (const p of HPLUCKS) {
    const tau = t - p.t;
    if (tau < 0 || tau > 3.5) continue;
    const x = clamp((u - p.u0) / (p.u1 - p.u0));
    d += p.a * Math.sin(Math.PI * x) * Math.exp(-tau / p.decay) * Math.cos(TAU * 5.4 * tau);
    d += p.a * 0.3 * Math.sin(TAU * x) * Math.exp(-tau / (p.decay * 0.5)) * Math.cos(TAU * 9.7 * tau + 1);
  }
  return d;
}
