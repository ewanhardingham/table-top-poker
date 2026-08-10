#!/usr/bin/env python3
"""Synthesize tactile knocks for the sound prototype (#181).

Public domain (CC0) — generated from scratch, no sampled source. A wooden
knock is a sharp filtered-noise click plus a couple of fast-decaying low
resonances (the body of the table). Emits:

  your-turn/turn-knock__synth.wav   double knock (a your-turn A/B option)
  your-turn/turn-tap__synth.wav     single soft tap

(The check cue now uses a knock the human recorded themselves, not a synth.)

Run: SOUNDS_DIR=assets/sounds python3 scripts/synth-knock.py
"""
import math
import os
import struct
import wave

SR = 44100


def knock(f1=190.0, f2=430.0, click_tau=0.0035, body_tau1=0.030,
          body_tau2=0.017, dur=0.070):
    """One wooden knock as a list of float samples."""
    n = int(dur * SR)
    out = []
    seed = 12345  # deterministic pseudo-noise, so the asset is reproducible
    prev = 0.0
    for i in range(n):
        t = i / SR
        seed = (1103515245 * seed + 12345) & 0x7FFFFFFF
        white = (seed / 0x7FFFFFFF) * 2.0 - 1.0
        prev = prev * 0.6 + white * 0.4  # one-pole low-pass: woody, not hissy
        click = prev * math.exp(-t / click_tau)
        body = (
            0.6 * math.sin(2 * math.pi * f1 * t) * math.exp(-t / body_tau1)
            + 0.35 * math.sin(2 * math.pi * f2 * t) * math.exp(-t / body_tau2)
        )
        out.append(0.5 * click + body)
    return out


def mix(events):
    """events: list of (start_seconds, samples). Returns normalized floats."""
    total = max(int(s * SR) + len(buf) for s, buf in events)
    acc = [0.0] * total
    for start, buf in events:
        off = int(start * SR)
        for i, v in enumerate(buf):
            acc[off + i] += v
    peak = max(1e-9, max(abs(v) for v in acc))
    return [0.85 * v / peak for v in acc]


def scale(buf, g):
    return [g * v for v in buf]


def write_wav(path, samples):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with wave.open(path, "w") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(b"".join(
            struct.pack("<h", max(-32767, min(32767, int(v * 32767))))
            for v in samples
        ))


base = os.environ.get("SOUNDS_DIR", "assets/sounds")

# your-turn: light double knock + a softer single tap (kept as A/B options).
write_wav(
    os.path.join(base, "your-turn", "turn-knock__synth.wav"),
    mix([(0.0, knock()), (0.115, scale(knock(), 0.85))]),
)
write_wav(
    os.path.join(base, "your-turn", "turn-tap__synth.wav"),
    mix([(0.0, scale(knock(), 0.8))]),
)

print("wrote synth knocks under", base)
