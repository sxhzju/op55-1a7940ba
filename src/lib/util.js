// Small deterministic toolkit: RNG, noise, easing, colour helpers.
// Every frame must depend only on its frame number, so nothing here uses Math.random.

export const clamp = (x, a = 0, b = 1) => (x < a ? a : x > b ? b : x);
export const lerp = (a, b, t) => a + (b - a) * t;
export const invlerp = (a, b, x) => clamp((x - a) / (b - a));
export const remap = (x, a, b, c, d) => lerp(c, d, invlerp(a, b, x));
export const smoothstep = (a, b, x) => {
  const t = invlerp(a, b, x);
  return t * t * (3 - 2 * t);
};
export const TAU = Math.PI * 2;

export function hash(...args) {
  let h = 2166136261 >>> 0;
  for (const a of args) {
    let v = Math.floor(a * 1000) | 0;
    h ^= v;
    h = Math.imul(h, 16777619);
    h ^= h >>> 13;
    h = Math.imul(h, 0x5bd1e995);
    h ^= h >>> 15;
  }
  return h >>> 0;
}

export function rng(seed) {
  let a = seed >>> 0 || 1;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// hash -> [0,1)
export const h01 = (...a) => hash(...a) / 4294967296;

// 1D value noise with smooth interpolation, range about [-1,1]
export function noise1(x, seed = 0) {
  const i = Math.floor(x);
  const f = x - i;
  const a = h01(i, seed) * 2 - 1;
  const b = h01(i + 1, seed) * 2 - 1;
  const u = f * f * f * (f * (f * 6 - 15) + 10);
  return a + (b - a) * u;
}

export function fbm1(x, seed = 0, oct = 3) {
  let s = 0, amp = 1, norm = 0;
  for (let o = 0; o < oct; o++) {
    s += noise1(x, seed + o * 17) * amp;
    norm += amp;
    amp *= 0.5;
    x *= 2.03;
  }
  return s / norm;
}

export function noise2(x, y, seed = 0) {
  const ix = Math.floor(x), iy = Math.floor(y);
  const fx = x - ix, fy = y - iy;
  const ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy);
  const a = h01(ix, iy, seed), b = h01(ix + 1, iy, seed);
  const c = h01(ix, iy + 1, seed), d = h01(ix + 1, iy + 1, seed);
  return (a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy) * 2 - 1;
}

// ---------- easing ----------
export const ease = {
  linear: (t) => t,
  quadOut: (t) => 1 - (1 - t) * (1 - t),
  cubicOut: (t) => 1 - Math.pow(1 - t, 3),
  cubicIn: (t) => t * t * t,
  quartOut: (t) => 1 - Math.pow(1 - t, 4),
  quintOut: (t) => 1 - Math.pow(1 - t, 5),
  expoOut: (t) => (t >= 1 ? 1 : 1 - Math.pow(2, -10 * t)),
  expoIn: (t) => (t <= 0 ? 0 : Math.pow(2, 10 * t - 10)),
  expoInOut: (t) =>
    t <= 0 ? 0 : t >= 1 ? 1 : t < 0.5 ? Math.pow(2, 20 * t - 10) / 2 : (2 - Math.pow(2, -20 * t + 10)) / 2,
  sineInOut: (t) => -(Math.cos(Math.PI * t) - 1) / 2,
  backOut: (t, s = 1.70158) => 1 + (s + 1) * Math.pow(t - 1, 3) + s * Math.pow(t - 1, 2),
  backIn: (t, s = 1.70158) => (s + 1) * t * t * t - s * t * t,
  backInOut: (t, s = 1.70158 * 1.525) =>
    t < 0.5
      ? (Math.pow(2 * t, 2) * ((s + 1) * 2 * t - s)) / 2
      : (Math.pow(2 * t - 2, 2) * ((s + 1) * (t * 2 - 2) + s) + 2) / 2,
  circOut: (t) => Math.sqrt(1 - Math.pow(t - 1, 2)),
};

// damped spring step response: 0 -> 1 with overshoot
export function spring(t, freq = 2.2, damp = 5) {
  if (t <= 0) return 0;
  return 1 - Math.exp(-damp * t) * Math.cos(TAU * freq * t);
}
// impulse response of a spring: 0 -> kick -> rings down to 0
export function springImpulse(t, freq = 2.5, damp = 4) {
  if (t <= 0) return 0;
  return Math.exp(-damp * t) * Math.sin(TAU * freq * t);
}

// CSS-like cubic bezier easing
export function bezier(x1, y1, x2, y2) {
  const cx = 3 * x1, bx = 3 * (x2 - x1) - cx, ax = 1 - cx - bx;
  const cy = 3 * y1, by = 3 * (y2 - y1) - cy, ay = 1 - cy - by;
  const sx = (t) => ((ax * t + bx) * t + cx) * t;
  const sy = (t) => ((ay * t + by) * t + cy) * t;
  const dx = (t) => (3 * ax * t + 2 * bx) * t + cx;
  return (x) => {
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    let t = x;
    for (let i = 0; i < 8; i++) {
      const e = sx(t) - x;
      const d = dx(t);
      if (Math.abs(e) < 1e-6 || Math.abs(d) < 1e-6) break;
      t -= e / d;
    }
    let lo = 0, hi = 1;
    for (let i = 0; i < 20 && Math.abs(sx(t) - x) > 1e-5; i++) {
      if (sx(t) < x) lo = t; else hi = t;
      t = (lo + hi) / 2;
    }
    return sy(t);
  };
}

// a few signature curves used across the film
export const curve = {
  // fast attack, long luxurious settle (pen strokes, ink)
  stroke: bezier(0.2, 0.0, 0.0, 1.0),
  // slow in, fast middle, soft land (camera travel)
  travel: bezier(0.7, 0.0, 0.2, 1.0),
  // heavy anticipation feel without overshoot
  heavy: bezier(0.8, 0.0, 0.1, 1.0),
  // gentle drift
  drift: bezier(0.45, 0.05, 0.35, 1.0),
};

// progress of an event between t0 and t1 with easing
export const prog = (t, t0, t1, fn = ease.linear) => fn(invlerp(t0, t1, t));

// ---------- colour ----------
export function hex(h) {
  const n = parseInt(h.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
export const mixc = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
export const rgba = (c, a = 1) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;

// piecewise keyed value: keys = [[t, v], ...] with per-segment easing (optional 3rd element)
export function keyed(keys, t) {
  if (t <= keys[0][0]) return keys[0][1];
  for (let i = 1; i < keys.length; i++) {
    if (t <= keys[i][0]) {
      const [t0, v0] = keys[i - 1];
      const [t1, v1, fn] = keys[i];
      const u = (fn || ease.sineInOut)((t - t0) / (t1 - t0));
      if (Array.isArray(v0)) return v0.map((x, k) => lerp(x, v1[k], u));
      return lerp(v0, v1, u);
    }
  }
  return keys[keys.length - 1][1];
}
