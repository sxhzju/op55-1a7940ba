// Hand-made media: paper, graphite, brush ink, watercolour. All procedural and deterministic.
import { rng, noise1, h01, clamp, lerp, TAU, rgba } from './util.js';

// ---------------------------------------------------------------- textures
function periodicNoise(x, y, P, seed) {
  const ix = Math.floor(x), iy = Math.floor(y);
  const fx = x - ix, fy = y - iy;
  const ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy);
  const m = (v) => ((v % P) + P) % P;
  const g = (a, b) => h01(m(a), m(b), seed);
  const a = g(ix, iy), b = g(ix + 1, iy), c = g(ix, iy + 1), d = g(ix + 1, iy + 1);
  return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy;
}

export function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

// Warm cold-press paper, tileable.
export function makePaper(S = 1024) {
  const c = makeCanvas(S, S);
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(S, S);
  const d = img.data;
  const R = rng(7);
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const m1 = periodicNoise((x / S) * 4, (y / S) * 4, 4, 11);
      const m2 = periodicNoise((x / S) * 16, (y / S) * 16, 16, 12);
      const m3 = periodicNoise((x / S) * 96, (y / S) * 96, 96, 13);
      const fine = R();
      const v = (m1 - 0.5) * 7 + (m2 - 0.5) * 5 + (m3 - 0.5) * 6 + (fine - 0.5) * 6;
      const i = (y * S + x) * 4;
      d[i] = 243 + v;
      d[i + 1] = 237 + v * 0.97;
      d[i + 2] = 224 + v * 0.9;
      d[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  // fibres
  const F = rng(99);
  for (let k = 0; k < 900; k++) {
    const x = F() * S, y = F() * S;
    const len = 6 + F() * 26;
    const a = F() * TAU;
    const dark = F() < 0.55;
    ctx.strokeStyle = dark ? `rgba(120,100,70,${0.05 + F() * 0.07})` : `rgba(255,252,245,${0.18 + F() * 0.2})`;
    ctx.lineWidth = 0.5 + F() * 0.8;
    for (const ox of [-S, 0, S]) for (const oy of [-S, 0, S]) {
      if (x + ox < -40 || x + ox > S + 40 || y + oy < -40 || y + oy > S + 40) continue;
      ctx.beginPath();
      ctx.moveTo(x + ox, y + oy);
      ctx.quadraticCurveTo(
        x + ox + Math.cos(a + 0.6) * len * 0.5, y + oy + Math.sin(a + 0.6) * len * 0.5,
        x + ox + Math.cos(a) * len, y + oy + Math.sin(a) * len);
      ctx.stroke();
    }
  }
  return c;
}

// Paper tooth: where graphite/pigment skips. Alpha mask used with destination-out.
export function makeTooth(S = 512, density = 0.5, seed = 3) {
  const c = makeCanvas(S, S);
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(S, S);
  const d = img.data;
  const R = rng(seed);
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const n = periodicNoise(x / 3.1, y / 2.3, S / 3.1 > 0 ? Math.round(S / 3.1) : 1, seed) * 0.6 +
        periodicNoise(x / 9, y / 7, Math.round(S / 9), seed + 1) * 0.4;
      let a = clamp((n - (1 - density)) / 0.25) * 255;
      a = a * (0.6 + R() * 0.4);
      const i = (y * S + x) * 4;
      d[i] = d[i + 1] = d[i + 2] = 0;
      d[i + 3] = a;
    }
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

export function makeGrain(w, h, seed) {
  const c = makeCanvas(w, h);
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(w, h);
  const d = img.data;
  const R = rng(seed);
  for (let i = 0; i < w * h; i++) {
    const v = R();
    const g = v < 0.5 ? 0 : 255;
    d[i * 4] = d[i * 4 + 1] = d[i * 4 + 2] = g;
    d[i * 4 + 3] = Math.abs(v - 0.5) * 2 * 255 * (R() < 0.6 ? 0.5 : 1);
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

// ---------------------------------------------------------------- geometry
// resample a polyline at roughly `step` spacing; returns {x:[],y:[],s:[],L}
export function resample(pts, step = 5) {
  const xs = [], ys = [], ss = [];
  if (pts.length < 2) return { x: xs, y: ys, s: ss, L: 0 };
  let acc = 0;
  xs.push(pts[0][0]); ys.push(pts[0][1]); ss.push(0);
  let carry = 0;
  for (let i = 1; i < pts.length; i++) {
    const [ax, ay] = pts[i - 1];
    const [bx, by] = pts[i];
    const seg = Math.hypot(bx - ax, by - ay);
    if (seg < 1e-6) continue;
    let d = step - carry;
    while (d <= seg) {
      const u = d / seg;
      xs.push(ax + (bx - ax) * u);
      ys.push(ay + (by - ay) * u);
      ss.push(acc + d);
      d += step;
    }
    carry = seg - (d - step);
    acc += seg;
  }
  const last = pts[pts.length - 1];
  if (acc - ss[ss.length - 1] > 0.5) {
    xs.push(last[0]); ys.push(last[1]); ss.push(acc);
  }
  return { x: xs, y: ys, s: ss, L: acc };
}

// ---------------------------------------------------------------- strokes
/*
 Variable-width ribbon with hand wobble.
 o = {
   w: base width, color:[r,g,b], alpha,
   from, to: drawn portion 0..1 (draw-on), head: taper length px at the moving end,
   taper: [startTaperPx, endTaperPx], pressure: 0..1 amount of mid-stroke thinning,
   boil: frame-boil seed (changes every 2 frames), wob: wobble amplitude px, wobF: wobble wavelength px,
   seed: per-stroke identity, step: resample spacing
 }
*/
export function ribbon(ctx, pts, o) {
  const step = o.step || 5;
  const r = o.rs || resample(pts, step);
  const n = r.x.length;
  if (n < 2) return;
  const L = r.L;
  const from = (o.from ?? 0) * L, to = (o.to ?? 1) * L;
  if (to - from < 0.5) return;
  const seed = o.seed || 0, boil = o.boil || 0;
  const wob = o.wob ?? 1.2, wobF = o.wobF || 70;
  const w0 = o.w ?? 2;
  const tp0 = o.taper ? o.taper[0] : w0 * 4, tp1 = o.taper ? o.taper[1] : w0 * 6;
  const pres = o.pressure ?? 0.3;
  const wfn = o.wfn;
  const left = [], right = [];
  for (let i = 0; i < n; i++) {
    const s = r.s[i];
    if (s < from - step || s > to + step) continue;
    const ss = clamp(s, from, to);
    const i0 = Math.max(0, i - 1), i1 = Math.min(n - 1, i + 1);
    let tx = r.x[i1] - r.x[i0], ty = r.y[i1] - r.y[i0];
    const tl = Math.hypot(tx, ty) || 1;
    tx /= tl; ty /= tl;
    const nx = -ty, ny = tx;
    const off = wob * (noise1(s / wobF + boil * 7.31, seed + boil) * 0.8 + noise1(s / (wobF * 0.27) + boil * 3.1, seed + 77) * 0.2);
    const u = (ss - from) / Math.max(1, to - from);
    let w = w0 * (1 - pres * Math.sin(Math.PI * clamp(s / L))) * (1 + 0.22 * noise1(s / 23 + seed, seed + 5 + boil));
    if (wfn) w *= wfn(s / L, s);
    const ta = clamp((ss - from) / tp0), tb = clamp((to - ss) / tp1);
    w *= Math.sqrt(ta) * Math.sqrt(tb);
    w = Math.max(0, w) * 0.5;
    let x = r.x[i], y = r.y[i];
    if (s !== ss) { // clamp endpoint along tangent
      x += tx * (ss - s); y += ty * (ss - s);
    }
    x += nx * off; y += ny * off;
    left.push(x + nx * w, y + ny * w);
    right.push(x - nx * w, y - ny * w);
  }
  if (left.length < 4) return;
  ctx.beginPath();
  ctx.moveTo(left[0], left[1]);
  for (let i = 2; i < left.length; i += 2) ctx.lineTo(left[i], left[i + 1]);
  for (let i = right.length - 2; i >= 0; i -= 2) ctx.lineTo(right[i], right[i + 1]);
  ctx.closePath();
  ctx.fillStyle = rgba(o.color || [30, 34, 48], o.alpha ?? 1);
  ctx.fill();
}

// Graphite: a main ribbon plus a lighter offset re-stroke, like a hand going over a line twice.
export function pencil(ctx, pts, o) {
  const rs = o.rs || resample(pts, o.step || 5);
  ribbon(ctx, pts, { ...o, rs });
  if (o.double !== false) {
    ribbon(ctx, pts, {
      ...o, rs, seed: (o.seed || 0) + 911, w: (o.w ?? 2) * 0.55, alpha: (o.alpha ?? 1) * 0.45,
      wob: (o.wob ?? 1.2) * 1.8 + 0.6, from: o.from, to: o.to,
    });
  }
}

// Brush leaf / flick: tapered ribbon with a fat belly near the start.
export function flick(ctx, x, y, ang, len, wid, o = {}) {
  const bend = o.bend ?? 0.15;
  const pts = [];
  for (let i = 0; i <= 10; i++) {
    const u = i / 10;
    const b = Math.sin(u * Math.PI) * bend * len;
    pts.push([x + Math.cos(ang) * len * u - Math.sin(ang) * b, y + Math.sin(ang) * len * u + Math.cos(ang) * b]);
  }
  ribbon(ctx, pts, {
    w: wid, color: o.color, alpha: o.alpha ?? 1, from: 0, to: o.to ?? 1, seed: o.seed || 0, boil: o.boil || 0,
    wob: o.wob ?? 0.6, pressure: 0, step: 3,
    wfn: (u) => Math.pow(Math.sin(Math.PI * Math.pow(u, 0.6)), 0.8) * (1 - 0.6 * u),
    taper: [2, 2],
  });
}

// ---------------------------------------------------------------- watercolour
// irregular closed blob. pts generated on the fly; layered translucent fills + darker wet edge.
export function blobPath(cx, cy, rx, ry, seed, boil, rough = 0.12, nPts = 72, rot = 0) {
  const pts = [];
  for (let i = 0; i < nPts; i++) {
    const a = (i / nPts) * TAU;
    const k = 1 + rough * (noise1(a * 1.6 + seed, seed) * 0.6 + noise1(a * 5.3 + boil * 0.21, seed + 3) * 0.3 + noise1(a * 23 + seed, seed + 9) * 0.1);
    const px = Math.cos(a) * rx * k, py = Math.sin(a) * ry * k;
    pts.push([cx + px * Math.cos(rot) - py * Math.sin(rot), cy + px * Math.sin(rot) + py * Math.cos(rot)]);
  }
  return pts;
}

export function fillPts(ctx, pts) {
  ctx.beginPath();
  ctx.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
  ctx.closePath();
}

export function wash(ctx, cx, cy, rx, ry, o) {
  const layers = o.layers || 4;
  const seed = o.seed || 0;
  const c = o.color;
  const a = o.alpha ?? 0.3;
  let last;
  const nPts = Math.min(420, Math.max(64, Math.round(Math.max(rx, ry) / 4)));
  for (let k = 0; k < layers; k++) {
    const sc = 1 - k * 0.06;
    const pts = blobPath(cx, cy, rx * sc, ry * sc, seed + k * 13, o.boil || 0, (o.rough ?? 0.14) * (1 + k * 0.25), nPts, o.rot || 0);
    fillPts(ctx, pts);
    ctx.fillStyle = rgba(c, a / layers * (k === 0 ? 1.4 : 1));
    ctx.fill();
    if (k === 0) last = pts;
  }
  if (o.edge !== 0) {
    // wet edge: pigment collects at the rim - a soft wide band plus a thin darker line
    fillPts(ctx, last);
    ctx.strokeStyle = rgba(o.edgeColor || c, (o.edge ?? 0.18) * a * 1.2);
    ctx.lineWidth = (o.edgeW || 2.2) * 2.6;
    ctx.stroke();
    ctx.strokeStyle = rgba(o.edgeColor || c, (o.edge ?? 0.18) * a * 2.2);
    ctx.lineWidth = (o.edgeW || 2.2) * 0.7;
    ctx.stroke();
  }
}

// wash over an arbitrary polygon (already noisy or not)
export function washPoly(ctx, pts, o) {
  const layers = o.layers || 3;
  const c = o.color;
  const a = o.alpha ?? 0.3;
  const seed = o.seed || 0;
  for (let k = 0; k < layers; k++) {
    const jit = (o.jit ?? 6) * (1 + k);
    const q = pts.map(([x, y], i) => [
      x + noise1(i * 0.37 + k * 5.1, seed + k) * jit,
      y + noise1(i * 0.41 + k * 3.7, seed + k + 50) * jit,
    ]);
    fillPts(ctx, q);
    if (o.gradient) ctx.fillStyle = o.gradient;
    else ctx.fillStyle = rgba(c, a / layers);
    ctx.globalAlpha = o.gradient ? a / layers : 1;
    ctx.fill();
    ctx.globalAlpha = 1;
    if (k === 0 && o.edge) {
      ctx.strokeStyle = rgba(o.edgeColor || c, o.edge);
      ctx.lineWidth = o.edgeW || 2;
      ctx.stroke();
    }
  }
}

// Ink splash: central blob + satellites, grows with p (0..1)
export function splash(ctx, x, y, r, p, o = {}) {
  if (p <= 0) return;
  const seed = o.seed || 0;
  const R = rng(seed + 1);
  const c = o.color || [30, 34, 48];
  const a = o.alpha ?? 1;
  const g = clamp(p);
  const pts = blobPath(x, y, r * (0.35 + 0.65 * g), r * (0.35 + 0.65 * g) * 0.92, seed, 0, 0.35, 48, R() * TAU);
  fillPts(ctx, pts);
  ctx.fillStyle = rgba(c, a);
  ctx.fill();
  const n = o.n || 9;
  for (let i = 0; i < n; i++) {
    const ang = (o.dir ?? R() * TAU) + (R() - 0.5) * (o.spread ?? TAU);
    const dist = r * (1.0 + R() * 1.6) * (0.4 + 0.6 * g) * (o.reach ?? 1);
    const rr = r * (0.06 + R() * 0.16) * (0.5 + 0.5 * g);
    const px = x + Math.cos(ang) * dist, py = y + Math.sin(ang) * dist;
    ctx.beginPath();
    ctx.ellipse(px, py, rr * 1.3, rr, ang, 0, TAU);
    ctx.fill();
    // tail connecting satellite
    if (R() < 0.5) {
      ctx.beginPath();
      ctx.moveTo(x + Math.cos(ang + 0.1) * r * 0.5, y + Math.sin(ang + 0.1) * r * 0.5);
      ctx.lineTo(px, py);
      ctx.lineTo(x + Math.cos(ang - 0.1) * r * 0.5, y + Math.sin(ang - 0.1) * r * 0.5);
      ctx.fill();
    }
  }
}

export { lerp };
