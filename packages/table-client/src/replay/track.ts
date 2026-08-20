import type { Beat } from "./beats.js";

/** Where one-tick-per-ordinal stops being legible on a table device (#129 §6). */
export const MAX_TICKS = 240;

/** Maps a fraction along the track to the ordinal it names. */
export function positionAtRatio(ratio: number, total: number): number {
  if (total <= 0) return 0;
  return Math.round(Math.max(0, Math.min(1, ratio)) * total);
}

/**
 * The ticks the track draws. Ticks are a visual affordance and may collapse on
 * a long hand; street boundaries never do, because chapters are the
 * navigation contract (#129 §6).
 */
export function ticksFor(beats: readonly Beat[]): readonly Beat[] {
  if (beats.length <= MAX_TICKS) return beats;
  const stride = Math.ceil(beats.length / MAX_TICKS);
  return beats.filter(
    (beat, index) => beat.isStreetBoundary || index % stride === 0,
  );
}
