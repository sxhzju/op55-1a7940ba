// Shared constants, palette, cue sheet and transform helpers.
import { hex } from './lib/util.js';

export const W = 1080, H = 1440, FPS = 30;
export const DURATION = 69.6; // audio 68.85 s + 0.75 s held ending
export const FRAMES = Math.round(DURATION * FPS);

// Limited palette: ink + paper neutrals, indigo (cool), celadon (clear), vermilion (warmth of people).
export const C = {
  paper: hex('#F3EDE0'),
  ink: hex('#1C2030'),
  graphite: hex('#3A3E4A'),
  pencil: hex('#5A5E68'),
  indigo: hex('#2B4876'),
  indigoWash: hex('#6A89B2'),
  celadon: hex('#8DB5A6'),
  celadonDeep: hex('#4C7C70'),
  vermilion: hex('#C8432B'),
  ochre: hex('#D49A45'),
  slate: hex('#8E99A8'),
  wood: hex('#C9A77C'),
};

// Cue sheet (seconds) from tools/analyze.py: onsets, beat grid, loudness peaks, silences.
export const CUE = {
  pluck1: 0.418, pluck2: 0.859, pluck3: 1.068, pluck4: 2.531, pluck5: 2.926,
  melt: 6.293, melt2: 6.525, fall: 7.105, rain: 7.57,
  town: 9.24, lamp1: 12.608, lamp2: 13.003, toBamboo: 14.071, bamboo: 14.97,
  gust1: 17.97, gust2: 22.97, rollWind: 26.87, roll: 28.54,
  bright: 35.33, peakD: 38.77, moon: 41.15, climax: 44.16,
  strikes: [46.672, 47.926, 48.762, 49.621, 50.039, 51.27, 51.873, 53.801, 54.242, 54.637, 55.078, 55.705,
    56.123, 56.541, 57.168, 57.585, 58.421, 58.839],
  swell: 59.26, apex: 59.70, calm: 60.6, last: 63.483, end: 63.6, click: 65.875, twitch: 67.152,
};

// mutable shared state filled by init()
export const S = { ctx: null, L: {}, TX: {}, PAT: {}, AUDIO: null, GLYPHS: [] };

// ---- 2D affine helpers, matrices as [a,b,c,d,e,f] like canvas setTransform
export const setM = (g, m) => g.setTransform(m[0], m[1], m[2], m[3], m[4], m[5]);
export const apply = (m, x, y) => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
export function inv(m) {
  const det = m[0] * m[3] - m[1] * m[2];
  const a = m[3] / det, b = -m[1] / det, c = -m[2] / det, d = m[0] / det;
  return [a, b, c, d, -(a * m[4] + c * m[5]), -(b * m[4] + d * m[5])];
}
export function mul(A, B) {
  return [
    A[0] * B[0] + A[2] * B[1], A[1] * B[0] + A[3] * B[1],
    A[0] * B[2] + A[2] * B[3], A[1] * B[2] + A[3] * B[3],
    A[0] * B[4] + A[2] * B[5] + A[4], A[1] * B[4] + A[3] * B[5] + A[5],
  ];
}
export const rot = (a) => [Math.cos(a), Math.sin(a), -Math.sin(a), Math.cos(a), 0, 0];
export const trans = (x, y) => [1, 0, 0, 1, x, y];

// camera -> canvas matrix for a layer with parallax p (1 = the paper plane).
// `ref` is the camera position at which the layer sits exactly where it was drawn.
export function M(cam, p = 1, ref = cam.ref) {
  const s = Math.pow(cam.z, p);
  const ox = ref[0] + (cam.x - ref[0]) * p, oy = ref[1] + (cam.y - ref[1]) * p;
  const c = Math.cos(cam.r), sn = Math.sin(cam.r);
  const a = s * c, b = s * sn, cc = -s * sn, d = s * c;
  return [a, b, cc, d, W / 2 + (cam.sx || 0) - (a * ox + cc * oy), H / 2 + (cam.sy || 0) - (b * ox + d * oy)];
}
