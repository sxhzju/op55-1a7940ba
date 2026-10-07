// Pre-rendered glyph bitmaps (crisp + soft bleed) with their ink bounding boxes.
import { rgba } from './lib/util.js';
import { makeCanvas } from './lib/draw.js';
import { C } from './core.js';

export function buildGlyphs(chars, size, color = C.ink) {
  return chars.map((ch) => {
    const SZ = Math.round(size * 1.5);
    const c = makeCanvas(SZ, SZ);
    const g = c.getContext('2d', { willReadFrequently: true });
    g.fillStyle = rgba(color);
    g.font = `${size}px MSZ`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(ch, SZ / 2, SZ / 2);
    const d = g.getImageData(0, 0, SZ, SZ).data;
    let x0 = SZ, y0 = SZ, x1 = 0, y1 = 0;
    for (let y = 0; y < SZ; y++) for (let x = 0; x < SZ; x++) {
      if (d[(y * SZ + x) * 4 + 3] > 40) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    }
    const b = makeCanvas(SZ, SZ);
    const bg = b.getContext('2d');
    bg.filter = `blur(${Math.max(2, Math.round(size / 34))}px)`;
    bg.drawImage(c, 0, 0);
    bg.filter = 'none';
    return { ch, c, b, S: SZ, cx: (x0 + x1) / 2, cy: (y0 + y1) / 2, w: x1 - x0, h: y1 - y0, x0, y0, x1, y1 };
  });
}
