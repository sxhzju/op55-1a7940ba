# 人间清又凉 · 琵琶曲

A 69.6-second hand-drawn motion piece (1080×1440, 30 fps) for the pipa track `original.m4a`.

**Idea:** one pencil line is a pipa string. Pluck it and it draws a piece of the human world. The poem rides
a string and melts into an ink drop. The drop falls as rain onto a canal town, the rain stops and grows into
bamboo, the sketchbook is turned 90° so the stalks lie down as a river, the river is strummed into a storm, and
a bloom of clear water from the moon washes everything away except one line, the horizon. That line is a string
again, and the poem is written once more beside the moon. The full shot list is in [TREATMENT.md](TREATMENT.md).

## Re-render

Requirements: Node 18+, FFmpeg on `PATH`, Google Chrome (or Chromium; set `CHROME_PATH` if it is not in a
standard location). The original audio `original.m4a` must be in the repo root (it is not committed).

```bash
npm ci
node render.mjs              # -> op55-hd.mp4 (H.264 yuv420p 1080x1440 30 fps, CRF 18, original AAC audio copied from t=0)
node render.mjs --workers 8  # more parallel Chrome pages
```

The full render takes about 5–6 minutes on an 8-core laptop (6 workers). For quick checks:

```bash
node render.mjs --from 0 --to 299                         # partial render -> out/partial.mp4
node tools/frames.mjs --name opening --from 180 --to 240 --step 3   # contact strip -> out/review/opening.png
node tools/frames.mjs --name all --every 15                # one frame every 0.5 s
```

Every frame is a pure function of its frame number (`renderFrame(n)` in `src/film.js`). Nothing uses
`Math.random` or wall-clock time, so frames can be rendered in any order or in parallel and the output is
deterministic.

## How it is built

- `src/film.js` sets up the frame and composites the layers onto the paper. Wash, line and text layers are
  multiplied onto a procedural cold-press paper that stays fixed in the world. Paper tooth breaks up graphite
  and pigment, and the camera's real motion over a 180° shutter adds the motion blur.
- `src/camera.js` holds the camera for the whole one-take shot. It is keyed in world space until the page turn
  and in river coordinates afterwards. It adds hand-held drift and spring kicks on the strikes.
- `src/scenes/opening.js`: strings with anticipation, plucks, travelling pulses and vibration ghosts; the
  instrument; the poem riding the string; ink drips; the hero drop.
- `src/scenes/town.js`: rain, the one-stroke roofline drawn on the beats, the canal reflection, and the walker.
- `src/scenes/lines.js`: the line family. Bamboo stalks morph into water lines; the same module holds the
  water displacement (strums, contour-line waves) and the final horizon string.
- `src/scenes/river.js`: dusk to night washes, ridge, geese, moon, boat, storm, lightning and the clearing bloom.
- `src/scenes/finale.js`: the poem written again and the seal.
- `src/lib/draw.js`: the media. Variable-width boiled ribbons for pencil and brush, leaf flicks, layered
  watercolour washes with wet edges, ink splashes, and generators for paper, tooth and grain.
- `src/lib/util.js`: seeded RNG, value noise, easing curves (expo, back, springs, custom béziers).
- `src/data/audio.json`: the audio analysis (onsets, beat grid, loudness envelope, silences). It is generated
  by `tools/analyze.py` (librosa) and committed, so Python is only needed if you want to regenerate it.
  The cue sheet in `src/core.js` comes from it.

Hand-drawn rules: lines re-boil every 2 frames, the rain and the characters move on twos, and the camera moves
on every frame. Easing is never linear or a uniform ease-in-out. Moves use expo, back, spring and custom
béziers, and grouped elements are staggered.

## Assets and licences

- Font: **Ma Shan Zheng** (马善政毛笔楷书), © The Ma Shan Zheng Project Authors, SIL Open Font License 1.1.
  `assets/fonts/MaShanZheng-subset.ttf` is a subset of the Google Fonts release that contains only the glyphs
  used here. The licence text is in `assets/fonts/OFL.txt`.
- Everything else (paper, textures, drawings) is generated procedurally by the code in this repository.
- The audio (`original.m4a`) and the rendered MP4 are not part of the repository.
- Code: MIT (see `LICENSE`).
