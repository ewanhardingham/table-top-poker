#!/usr/bin/env python3
"""Synthesize tactile 'action on you' knocks for the sound prototype (#181).

Public domain (CC0) — generated from scratch, no sampled source. A wooden
knock is a sharp filtered-noise click plus a couple of fast-decaying low
resonances (the body of the table). The double-knock is the poker 'your
action' tap-tap; the single tap is a softer A/B.
"""
import math
import os
import struct
import wave

SR = 44100


def knock(peak_delay=0.0):
    """One wooden knock as a list of float samples (~70ms)."""
    n = int(0.070 * SR)
    out = []
    # Deterministic pseudo-noise so the asset is reproducible.
    seed = 12345
    prev = 0.0
    for i in range(n):
        t = i / SR
        # LCG noise, lightly low-passed (one-pole) to sound woody not hissy.
        seed = (1103515245 * seed + 12345) & 0x7FFFFFFF
        white = (seed / 0x7FFFFFFF) * 2.0 - 1.0
        prev = prev * 0.6 + white * 0.4
        click = prev * math.exp(-t / 0.0035)
        body = (
            0.6 * math.sin(2 * math.pi * 190 * t) * math.exp(-t / 0.030)
            + 0.35 * math.sin(2 * math.pi * 430 * t) * math.exp(-t / 0.017)
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


def write_wav(path, samples):
    with wave.open(path, "w") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(SR)
        frames = b"".join(
            struct.pack("<h", max(-32767, min(32767, int(v * 32767))))
            for v in samples
        )
        w.writeframes(frames)


out_dir = os.environ["OUT_DIR"]
os.makedirs(out_dir, exist_ok=True)

# Double knock: two taps ~115ms apart, the second a touch softer.
double = mix([(0.0, knock()), (0.115, [0.85 * v for v in knock()])])
write_wav(os.path.join(out_dir, "turn-knock__synth.wav"), double)

# Single soft tap.
single = mix([(0.0, [0.8 * v for v in knock()])])
write_wav(os.path.join(out_dir, "turn-tap__synth.wav"), single)

print("wrote:", sorted(os.listdir(out_dir)))
