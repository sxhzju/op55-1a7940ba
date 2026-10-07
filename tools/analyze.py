"""Audio analysis -> src/data/audio.json

Requires: ffmpeg, python3 with librosa + numpy.
Usage:  python3 tools/analyze.py original.m4a src/data/audio.json

The JSON is committed, so re-rendering does not need Python.
It contains (all times in seconds, from 0 = start of the original audio):
  beats    - percussive beat grid (librosa beat tracker on the HPSS percussive part)
  onsets   - [time, strength 0..1] for every detected attack
  rms      - loudness envelope sampled at 30 fps, mapped to 0..1 (-40 dB .. -6 dB)
  silences - [start, end] from ffmpeg silencedetect (-35 dB, 0.25 s)
"""
import json, subprocess, sys, tempfile, os, re
import numpy as np, librosa

src, dst = sys.argv[1], sys.argv[2]
with tempfile.TemporaryDirectory() as td:
    wav = os.path.join(td, "a.wav")
    subprocess.run(["ffmpeg", "-loglevel", "error", "-y", "-i", src, "-ac", "1", "-ar", "22050", wav], check=True)
    y, sr = librosa.load(wav, sr=22050)

hop = 512
oenv = librosa.onset.onset_strength(y=y, sr=sr, hop_length=hop)
on_f = librosa.onset.onset_detect(onset_envelope=oenv, sr=sr, hop_length=hop)
on_t = librosa.frames_to_time(on_f, sr=sr, hop_length=hop)
strength = oenv[on_f] / np.percentile(oenv[on_f], 98)
onsets = [[round(float(t), 3), round(float(min(1.0, s)), 3)] for t, s in zip(on_t, strength)]

perc = librosa.effects.percussive(y)
penv = librosa.onset.onset_strength(y=perc, sr=sr, hop_length=hop)
_, beats = librosa.beat.beat_track(onset_envelope=penv, sr=sr, hop_length=hop, units="time")

fps = 30
rms = librosa.feature.rms(y=y, frame_length=2048, hop_length=hop)[0]
t = librosa.frames_to_time(np.arange(len(rms)), sr=sr, hop_length=hop)
dur = len(y) / sr
ft = np.arange(0, dur + 1.0, 1.0 / fps)
db = 20 * np.log10(np.interp(ft, t, rms) + 1e-9)
env = np.clip((db + 40) / 34, 0, 1)

out = subprocess.run(["ffmpeg", "-hide_banner", "-i", src, "-af", "silencedetect=noise=-35dB:d=0.25", "-f", "null", "-"],
                     capture_output=True, text=True).stderr
st = [float(x) for x in re.findall(r"silence_start: ([\d.]+)", out)]
en = [float(x) for x in re.findall(r"silence_end: ([\d.]+)", out)]
sil = [[round(a, 3), round(b, 3)] for a, b in zip(st, en + [dur] * (len(st) - len(en)))]

json.dump({"duration": round(dur, 3), "fps": fps, "beats": [round(float(b), 3) for b in beats],
           "onsets": onsets, "rms": [round(float(v), 3) for v in env], "silences": sil},
          open(dst, "w"), separators=(",", ":"))
print("onsets", len(onsets), "beats", len(beats), "dur", dur)
