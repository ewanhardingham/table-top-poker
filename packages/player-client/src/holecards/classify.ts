import { FOLD_AXIS_RATIO } from "./constants.js";

/**
 * What a pointer drag turned out to be (Phase 3 spec #138 §4). There is no
 * "undecided" member: classification happens exactly once, on the first move
 * past the slop, and the recognizer is `Pressing` until then.
 */
export type Classification = "Bending" | "FoldDragging" | "Ignored";

export interface ClassifyInput {
  /** The press landed on the bend affordance in the card's corner. */
  readonly fromBendZone: boolean;
  /** The pair was already face-up when the press landed. */
  readonly alreadyRevealed: boolean;
  readonly dx: number;
  readonly dy: number;
  /** Sampled **once**, here. §6 covers what happens when it later changes. */
  readonly foldLegal: boolean;
}

/**
 * The whole of the §4 table, as a pure function. Stickiness is not its
 * business — that is a property of the reducer, which accepts the
 * classification event only from `Pressing`.
 *
 * Three consequences, all intentional:
 *
 * - **A fold cannot start from the bend zone while face-down.** A press on the
 *   corner locks into `Bending` and a later upward swipe keeps bending. Fold
 *   stays available from the whole rest of the pair. The alternative — a
 *   bend→fold promotion rule — would need a second, more decisive upward
 *   threshold, weakening the fold threshold everywhere else to recover one
 *   corner.
 * - **`Ignored` is terminal.** A drag that starts sideways or downward cannot
 *   become a fold by curving upward.
 * - **Fold legality is sampled once.** A drag that outlives the player's turn
 *   disarms rather than reclassifies.
 */
export function classify({
  fromBendZone,
  alreadyRevealed,
  dx,
  dy,
  foldLegal,
}: ClassifyInput): Classification {
  // The bend zone wins outright while face-down — but there is nothing to peel
  // back on a pair that is already face-up, so the corner is ordinary card
  // surface then and a fold can start from it.
  if (fromBendZone && !alreadyRevealed) return "Bending";
  if (foldLegal && dy < 0 && Math.abs(dy) > Math.abs(dx) * FOLD_AXIS_RATIO) {
    return "FoldDragging";
  }
  return "Ignored";
}
