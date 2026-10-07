// One continuous camera over one sheet of paper.
// Before the page turn it is keyed in world coordinates; after it, in river-local coordinates
// (u along the river = screen right, v across = screen down), converted back to world.
import { keyed, ease, curve, fbm1, springImpulse, clamp, bezier, smoothstep } from './lib/util.js';
import { CUE } from './core.js';
import { P, ROLL } from './scenes/lines.js';

const fall = bezier(0.62, 0, 0.32, 1);
const glide = bezier(0.32, 0, 0.68, 1);
const swing = bezier(0.66, 0, 0.22, 1);

const WK = {
  x: [[0, 120], [0.4, 116], [3.4, -20, bezier(0.5, 0, 0.2, 1)], [6.2, 60, bezier(0.45, 0, 0.6, 1)], [6.6, 50], [CUE.town, 110, fall], [14.0, 430, bezier(0.4, 0, 0.5, 1)],
    [16.6, 1640, curve.travel], [25.9, 2560, glide], [ROLL.land, 3200, bezier(0.55, 0, 0.35, 1)]],
  y: [[0, -90], [0.4, -86], [3.4, 40, bezier(0.5, 0, 0.2, 1)], [6.2, 40, bezier(0.45, 0, 0.6, 1)], [6.6, 72, ease.quadOut], [CUE.town, 2240, fall], [14.0, 2200, ease.sineInOut],
    [16.6, 1580, curve.travel], [21.5, 1600, ease.sineInOut], [26.6, 1660, ease.sineInOut], [ROLL.land, 1650, ease.sineInOut]],
  z: [[0, 1.24], [0.4, 1.235], [3.4, 0.9, bezier(0.5, 0, 0.2, 1)], [6.2, 1.07, bezier(0.45, 0, 0.6, 1)], [6.6, 1.08, ease.cubicOut], [CUE.town, 1.0, fall], [14, 1.07, bezier(0.4, 0, 0.5, 1)],
    [16.6, 0.98, curve.travel], [22, 1.05], [26.6, 1.0], [ROLL.land, 1.03]],
  r: [[0, 0.012], [3.4, -0.006, bezier(0.5, 0, 0.2, 1)], [6.2, 0.008, bezier(0.45, 0, 0.6, 1)], [9.6, 0.003, curve.travel], [14, -0.003], [ROLL.start, 0.0],
    [ROLL.swing, 0.055, ease.sineInOut], [ROLL.land, -Math.PI / 2 - 0.035, swing], [ROLL.settle, -Math.PI / 2, ease.sineInOut]],
};
// river-local camera
const LK = {
  u: [[ROLL.land, 0], [30.5, 60, ease.cubicIn], [44.16, 700, ease.linear], [47.0, 860, ease.sineInOut], [58.8, 1260, ease.linear],
    [CUE.apex, 1300, ease.cubicOut], [63.6, 1410, ease.sineInOut], [69.6, 1460, ease.sineInOut]],
  v: [[ROLL.land, 0], [33, -20], [40.5, 150, ease.sineInOut], [42.7, -120, bezier(0.6, 0, 0.3, 1)], [44.16, -70, ease.sineInOut], [47.0, 130, ease.sineInOut], [58.8, 110], [CUE.swell, 60],
    [CUE.apex, -60, ease.expoIn], [61.6, -170, ease.cubicOut], [69.6, -205, ease.sineInOut]],
  z: [[ROLL.land, 1.03], [33, 1.0], [40.5, 1.2, ease.sineInOut], [42.7, 0.98, bezier(0.6, 0, 0.3, 1)], [44.16, 1.0, ease.sineInOut], [47.0, 1.22, ease.sineInOut], [58.8, 1.16], [CUE.swell, 1.1],
    [CUE.apex, 1.36, ease.expoIn], [61.8, 0.94, bezier(0.1, 0.6, 0.3, 1)], [69.6, 1.0, bezier(0.3, 0, 0.4, 1)]],
};

export function camera(t) {
  let x, y, z, r;
  if (t <= ROLL.land) {
    x = keyed(WK.x, t); y = keyed(WK.y, t); z = keyed(WK.z, t); r = keyed(WK.r, t);
  } else {
    const u = keyed(LK.u, t), v = keyed(LK.v, t);
    x = P[0] - v; y = P[1] + u;
    z = keyed(LK.z, t);
    r = keyed(WK.r, t);
  }
  // hand-held breathing (screen-ish: applied in world, small)
  x += fbm1(t * 0.13, 5) * 10;
  y += fbm1(t * 0.11, 6) * 8;
  r += fbm1(t * 0.09, 7) * 0.004;
  // the release shakes the page
  const kick = springImpulse(t - CUE.melt, 3.2, 6) + springImpulse(t - CUE.melt2, 3.6, 7) * 0.6;
  x += kick * 9;
  r += kick * 0.006;
  z += Math.max(0, springImpulse(t - CUE.melt, 2.0, 5)) * 0.012;
  // the big gust swings the camera with the grove
  r += springImpulse(t - CUE.gust2 - 0.15, 0.7, 1.8) * 0.022;
  x -= springImpulse(t - CUE.gust2 - 0.15, 0.7, 1.8) * 40;
  // landing bounce when the drop hits the water
  y -= springImpulse(t - CUE.town, 1.3, 3.5) * 22;
  z += springImpulse(t - CUE.town, 1.3, 3.5) * 0.01;
  // climax strikes: each one knocks the camera
  let sx = 0, sy = 0;
  CUE.strikes.forEach((ts, i) => {
    const k = springImpulse(t - ts, 3.4, 6.5);
    const a = i % 3 === 0 ? 1 : 0.6;
    sx += k * 12 * a * (i % 2 ? 1 : -1);
    sy += k * 16 * a;
    r += k * 0.013 * a * (i % 2 ? -1 : 1);
  });
  // the storm rocks the whole page
  const rock = clamp((t - CUE.climax) / 2.5) * (1 - clamp((t - CUE.swell) / 0.4));
  if (rock > 0) {
    r += rock * (Math.sin(t * 1.9) * 0.022 + Math.sin(t * 3.1 + 1) * 0.008);
    sy += rock * Math.sin(t * 1.9 + 0.8) * 18;
    sx += rock * Math.sin(t * 1.3) * 14;
  }
  const ak = springImpulse(t - CUE.apex, 2.2, 3.2);
  sy += ak * 30;
  r += ak * 0.02;
  return { x, y, z, r, sx, sy, ref: [0, 0] };
}
