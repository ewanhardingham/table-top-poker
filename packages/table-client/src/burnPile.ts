import { BOARD_CARD_EM } from "./boardDeal.js";

/**
 * The cue (`assets/sounds/burn.wav`) is exactly 700ms long and peaks at 500ms,
 * so the budget is the cue's own length: the card finishes being eaten as the
 * sound dies. See `docs/design/burn-pile.md`.
 */
export const BURN_BUDGET_S = 0.7;

/** Where the cue's swell is loudest, and so where the ember front is brightest. */
export const CUE_PEAK_S = 0.5;

export interface BurnPhase {
  readonly delay: number;
  readonly duration: number;
}

export interface BurnTiming {
  /** The card flies in from the deck. */
  readonly travel: BurnPhase;
  /** The front catches and builds to the cue's peak. */
  readonly ignite: BurnPhase;
  /** The front eats the card away, finishing on the budget. */
  readonly consume: BurnPhase;
  /** Ash falls, running on past the budget in silence. */
  readonly settle: BurnPhase;
  readonly peakAt: number;
  readonly total: number;
}

const TRAVEL_S = 0.26;
const CATCH_AT_S = 0.13;
const CONSUME_AT_S = 0.18;

/**
 * Ash keeps falling for this long after the card has gone. It is outside the
 * budget on purpose: falling ash is silent, and gating the street on it would
 * cost the table another 700ms a street for a low-contrast detail.
 */
const SETTLE_TAIL_S = 0.7;

const STILL: BurnPhase = { delay: 0, duration: 0 };

export function burnTiming(reducedMotion = false): BurnTiming {
  if (reducedMotion) {
    return {
      travel: STILL,
      ignite: STILL,
      consume: STILL,
      settle: STILL,
      peakAt: 0,
      total: 0,
    };
  }

  return {
    travel: { delay: 0, duration: TRAVEL_S },
    ignite: { delay: CATCH_AT_S, duration: CUE_PEAK_S - CATCH_AT_S },
    consume: { delay: CONSUME_AT_S, duration: BURN_BUDGET_S - CONSUME_AT_S },
    settle: {
      delay: CONSUME_AT_S,
      duration: BURN_BUDGET_S + SETTLE_TAIL_S - CONSUME_AT_S,
    },
    peakAt: CUE_PEAK_S,
    total: BURN_BUDGET_S + SETTLE_TAIL_S,
  };
}

/** The board waits out the card's destruction, not the ash's fall. */
export function streetDealDelay(reducedMotion = false): number {
  return reducedMotion ? 0 : BURN_BUDGET_S;
}

export function clamp01(value: number): number {
  return value < 0 ? 0 : value > 1 ? 1 : value;
}

/** How far into `phase` the clock is, 0 before it opens and 1 once it closes. */
export function phaseProgress(phase: BurnPhase, elapsed: number): number {
  if (phase.duration <= 0) return elapsed >= phase.delay ? 1 : 0;
  return clamp01((elapsed - phase.delay) / phase.duration);
}

export function easeOut(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

/**
 * The ember glow, 0 to 1, brightest exactly on the cue's peak and out by the
 * budget. A symmetric curve over the budget would peak at 350ms — ahead of the
 * swell — so the rise and the fall are shaped separately.
 */
export function cueHeat(timing: BurnTiming, elapsed: number): number {
  if (timing.peakAt <= 0 || elapsed <= 0) return 0;
  if (elapsed >= BURN_BUDGET_S) return 0;
  const shape =
    elapsed < timing.peakAt
      ? Math.sin((Math.PI / 2) * (elapsed / timing.peakAt))
      : Math.cos(
          (Math.PI / 2) *
            ((elapsed - timing.peakAt) / (BURN_BUDGET_S - timing.peakAt)),
        );
  return Math.pow(clamp01(shape), 1.4);
}

/**
 * The pile's geometry, in the pile's own em — which `BOARD_CARD_EM` sets, so
 * the burnt card matches the community cards beside it. The stage is far wider
 * than the card because embers leave it and ash falls below it.
 */
export const ASH_STAGE = {
  width: 11.5,
  height: 8.6,
  cardWidth: 3.5,
  cardHeight: 5,
  restX: 3.9,
  restY: 3.9,
  deckX: 12.7,
  deckY: 0.6,
} as const;

/** The felt the ash lands on: the resting card's own bottom edge. */
export const ASH_FLOOR_Y = ASH_STAGE.restY + ASH_STAGE.cardHeight / 2;

/**
 * Felt between the ash and the community row, in the *pile's* em — so the gap
 * on the felt is `BOARD_GAP_EM * BOARD_CARD_EM`, about 3.2 of `Board`'s own em
 * (~52px). `Board` shipped 1.2 of its em (~19px), sized for a neat stack of
 * cards; ash is a loose scatter and needs the felt around it to read as
 * separate from the street, so this is a little under three times that.
 */
export const BOARD_GAP_EM = 1.35;

/** How far the stage overhangs the resting card's right edge. */
const ASH_OVERHANG_EM =
  ASH_STAGE.width - ASH_STAGE.restX - ASH_STAGE.cardWidth / 2;

/**
 * `Board` positions the pile in its own em, but the stage is measured in the
 * pile's. These convert, so the gap lands against the card rather than against
 * the stage box that surrounds it.
 */
export const ASH_PILE_RIGHT_EM =
  (BOARD_GAP_EM - ASH_OVERHANG_EM) * BOARD_CARD_EM;
export const ASH_PILE_TOP_EM =
  -(ASH_STAGE.restY - ASH_STAGE.cardHeight / 2) * BOARD_CARD_EM;

/**
 * Ash settles inside the card's own footprint. Left to drift it spreads wider
 * than the card it came from and runs under the flop; `tanh` squashes the tail
 * of the spread back in rather than clamping it, so the edges stay ragged. The
 * softness keeps the squash off its own asymptote — at 1 the outliers bunch
 * against the limit and the pile reads as a slab with cut ends.
 */
export const ASH_HALF_W = ASH_STAGE.cardWidth * 0.52;
const SQUASH_SOFTNESS = 1.6;

export function ashFootprint(x: number): number {
  const { restX } = ASH_STAGE;
  return (
    restX + Math.tanh((x - restX) / (ASH_HALF_W * SQUASH_SOFTNESS)) * ASH_HALF_W
  );
}

export const HEAP_COLUMNS = 64;

/** Per landed flake, against a cap: enough to mound in the middle, not plateau. */
export const HEAP_RISE_EM = 0.0026;
export const HEAP_MAX_EM = 0.36;

/**
 * The column a flake arriving at the raw stage `x` comes to rest in. It takes
 * the raw x and squashes internally, so every heap function must be handed the
 * coordinate at the same stage of the squash — footprint it first and the flake
 * raises one column while being read back against another.
 */
export function heapIndex(x: number): number {
  const offset = (ashFootprint(x) - ASH_STAGE.restX) / ASH_HALF_W;
  const column = Math.round((offset + 1) * 0.5 * (HEAP_COLUMNS - 1));
  return Math.min(HEAP_COLUMNS - 1, Math.max(0, column));
}

/** The felt, or the top of what has already landed there. Takes a raw x. */
export function heapSurfaceY(heap: Readonly<Float32Array>, x: number): number {
  return ASH_FLOOR_Y - Math.min(HEAP_MAX_EM, heap[heapIndex(x)] ?? 0);
}

/** Raises the column a flake arriving at the raw stage `x` lands in. */
export function raiseHeap(heap: Float32Array, x: number): void {
  const index = heapIndex(x);
  heap[index] = Math.min(HEAP_MAX_EM, (heap[index] ?? 0) + HEAP_RISE_EM);
}

/**
 * Lands a flake that arrived at the raw stage `x`: raises the column it comes
 * to rest in, and returns where that is. The squash and the raise are one step
 * so they cannot drift apart — footprinting before raising mounds a column
 * nothing reads back, and leaves the flake's own column flat.
 */
export function settleFlake(heap: Float32Array, x: number): number {
  raiseHeap(heap, x);
  return ashFootprint(x);
}

/**
 * Which points of a preallocated buffer have changed since the last upload.
 *
 * `three` drains an attribute's update ranges once per render, so every point
 * touched between two renders has to be coalesced into one span and handed over
 * together. Queueing a range per point and clearing as you go keeps only the
 * last: the rest of the frame's points stay at their zero-initialised size and
 * alpha, counted by the draw range and invisible.
 */
export interface DirtySpan {
  from: number;
  to: number;
}

export function emptySpan(): DirtySpan {
  return { from: Infinity, to: -1 };
}

export function markSpan(span: DirtySpan, start: number, count = 1): void {
  if (count <= 0) return;
  if (start < span.from) span.from = start;
  const end = start + count - 1;
  if (end > span.to) span.to = end;
}

export function clearSpan(span: DirtySpan): void {
  span.from = Infinity;
  span.to = -1;
}

/** The slice to upload, or null when nothing has been touched. */
export function spanRange(
  span: DirtySpan,
): { readonly start: number; readonly count: number } | null {
  if (span.to < span.from) return null;
  return { start: span.from, count: span.to - span.from + 1 };
}

export type BurnTransition = "none" | "burn" | "resettle";

/**
 * What a change in `burnedCount` means to a scene that is already running. Only
 * a step of exactly one is a card catching fire: a replay seek can move the
 * count backwards, or forward by a whole street at once, and both have to land
 * as a pile that is simply already the right size.
 */
export function burnTransition(count: number, before: number): BurnTransition {
  if (count === before) return "none";
  return count === before + 1 ? "burn" : "resettle";
}
