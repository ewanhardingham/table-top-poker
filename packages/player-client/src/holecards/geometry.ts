import { BEND_TRAVEL_PX } from "./constants.js";

/** Which way a live bend is mostly going — the §11 hint swaps on it. */
export type BendAxis = "left" | "up";

/**
 * Peel progress, 0 → 1, for a drag of `dx`/`dy` from where the finger landed
 * (Phase 3 spec #138 §15). Prototype-validated; read rather than re-derived.
 *
 * Leftward and upward travel count **equally**, and only inward travel counts
 * at all. Two consequences the formula exists for:
 *
 * - A pure leftward drag drives the peel at the full rate, so the player can
 *   peel with their finger clear of the rank and suit they are trying to read.
 * - Because leftward alone is enough, the bend cannot be stolen by the fold
 *   recognizer, which needs upward dominance (§4).
 */
export function bendProgress(dx: number, dy: number): number {
  const inward = Math.max(0, -dx) + Math.max(0, -dy);
  return Math.min(1, inward / BEND_TRAVEL_PX);
}

/**
 * Which axis a bend is being driven along. Ties read as `up`: a bend that is
 * equally upward and leftward still has the finger over the card face, which
 * is the case the "drag left" prompt exists to fix.
 */
export function bendAxis(dx: number, dy: number): BendAxis {
  return Math.abs(dy) >= Math.abs(dx) ? "up" : "left";
}
