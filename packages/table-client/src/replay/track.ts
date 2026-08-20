import type { Beat } from "./beats.js";

/**
 * Where one-tick-per-ordinal stops being legible: past a few hundred ticks
 * they are sub-pixel on a table device and the thumb covers dozens of them.
 * Hand length is unbounded — `raise` is always legal and uncapped — so this
 * is reached by a real hand, not only by an exotic one (Phase 2 spec #129 §5).
 */
export const MAX_TICKS = 240;

/** Maps a fraction along the track to the ordinal it names. */
export function positionAtRatio(ratio: number, total: number): number {
  if (total <= 0) return 0;
  return Math.round(Math.max(0, Math.min(1, ratio)) * total);
}

/**
 * The ticks the track draws. Ticks are a visual affordance — the hand's
 * *shape*, where the action clustered — and may collapse on a long hand;
 * street boundaries never do, because chapters are the navigation contract
 * (§6).
 */
export function ticksFor(beats: readonly Beat[]): readonly Beat[] {
  if (beats.length <= MAX_TICKS) return beats;
  const stride = Math.ceil(beats.length / MAX_TICKS);
  return beats.filter(
    (beat, index) => beat.isStreetStart || index % stride === 0,
  );
}
