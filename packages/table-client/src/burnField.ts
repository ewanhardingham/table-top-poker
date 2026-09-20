/**
 * The burn front is a scalar field: each texel of the card holds the moment it
 * is eaten, 0 first to 1 last. One field drives both the shader's threshold and
 * the ash particles' birth times, so a flake leaves the card exactly where and
 * when the front passes it — see `docs/design/burn-pile.md`.
 */

function hash(x: number, y: number, seed: number): number {
  const n = Math.sin(x * 127.1 + y * 311.7 + seed * 74.7) * 43758.5453123;
  return n - Math.floor(n);
}

function smooth(t: number): number {
  return t * t * (3 - 2 * t);
}

function valueNoise(x: number, y: number, seed: number): number {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = smooth(x - ix);
  const fy = smooth(y - iy);
  const a = hash(ix, iy, seed);
  const b = hash(ix + 1, iy, seed);
  const c = hash(ix, iy + 1, seed);
  const d = hash(ix + 1, iy + 1, seed);
  return (a + (b - a) * fx) * (1 - fy) + (c + (d - c) * fx) * fy;
}

const OCTAVES = 4;
const GAIN_SUM = 0.9375;

export function fbm(x: number, y: number, seed: number): number {
  let sum = 0;
  let amplitude = 0.5;
  let frequency = 1;
  for (let octave = 0; octave < OCTAVES; octave += 1) {
    sum +=
      valueNoise(x * frequency, y * frequency, seed + octave * 17) * amplitude;
    amplitude *= 0.5;
    frequency *= 2.07;
  }
  return sum / GAIN_SUM;
}

export interface DissolveField {
  readonly width: number;
  readonly height: number;
  /** Row 0 is the card's bottom edge, matching an unflipped GL texture. */
  readonly values: Float32Array;
}

const NOISE_CELLS = 3.4;
const NOISE_WEIGHT = 0.44;
const SIDE_LEAN = 0.34;

/** Fire climbs: the front opens at the bottom, leaning across as it goes. */
export function dissolveField(
  width: number,
  height: number,
  seed: number,
): DissolveField {
  const values = new Float32Array(width * height);
  let min = Infinity;
  let max = -Infinity;

  for (let y = 0; y < height; y += 1) {
    const v = y / (height - 1);
    for (let x = 0; x < width; x += 1) {
      const u = x / (width - 1);
      const sweep = (1 - SIDE_LEAN) * v + SIDE_LEAN * u;
      const noise = fbm(u * NOISE_CELLS, v * NOISE_CELLS * 1.4, seed);
      const value = sweep * (1 - NOISE_WEIGHT) + noise * NOISE_WEIGHT;
      values[y * width + x] = value;
      if (value < min) min = value;
      if (value > max) max = value;
    }
  }

  // Normalised so the threshold sweeping 0 to 1 eats exactly the whole card.
  const span = max - min || 1;
  for (let i = 0; i < values.length; i += 1) {
    values[i] = ((values[i] ?? 0) - min) / span;
  }
  return { width, height, values };
}

export function fieldAt(field: DissolveField, u: number, v: number): number {
  const x = Math.min(
    field.width - 1,
    Math.max(0, Math.round(u * (field.width - 1))),
  );
  const y = Math.min(
    field.height - 1,
    Math.max(0, Math.round(v * (field.height - 1))),
  );
  return field.values[y * field.width + x] ?? 0;
}

export function fieldToBytes(field: DissolveField): Uint8Array {
  const bytes = new Uint8Array(field.values.length);
  for (let i = 0; i < field.values.length; i += 1) {
    bytes[i] = Math.round((field.values[i] ?? 0) * 255);
  }
  return bytes;
}
