import type { PlayerView, SeatId, TableView } from "@table-top-poker/protocol";
import { color } from "./theme.js";

/**
 * Which positional marker a seat carries, if any. Never more than one.
 *
 * Both devices show the same three markers, so the rule that picks one lives
 * here rather than in either client: the table draws it on every seat pod, the
 * player screen draws it for the one seat that is theirs, and neither can drift
 * from the other's answer for the same seat.
 */
export type PositionMarker = "button" | "small-blind" | "big-blind";

export const positionMarkerLabel: Record<PositionMarker, string> = {
  button: "D",
  "small-blind": "SB",
  "big-blind": "BB",
};

export const positionMarkerColor: Record<PositionMarker, string> = {
  button: color.buttonMarker,
  "small-blind": color.blindSmallMarker,
  "big-blind": color.blindBigMarker,
};

/**
 * Which marker this seat carries. All three come off the same view, so the
 * trio always moves on one tick and no seat ever carries two.
 *
 * Two suppressions, both deliberate:
 *
 * - Between hands (`no-hand`) only the button shows. The engine reports no
 *   blinds without a hand, and the button it does report is already a
 *   forecast of the next deal.
 * - **Heads-up (`dealtSeatCount === 2`) only the button shows — no `SB` on
 *   the button seat, and no `BB` on the other seat either.** The engine
 *   honestly reports `smallBlind === button` heads-up (the button does post
 *   the small blind), which would put two markers on one seat. Rather than
 *   stack or combine them, a heads-up hand reverts to exactly the display
 *   that existed before blind markers were added. This is a decision
 *   (issue #160, decision 4), not an oversight.
 *
 * The second suppression is a table-shaped rule applied to both devices on
 * purpose (issue #207, decision 2): a player screen shows one seat, so it has
 * no collision to resolve and could name the heads-up big blind — but then the
 * phone would mark a seat the table beside it deliberately leaves bare.
 */
export function positionMarkerFor(
  seatId: SeatId,
  view: PlayerView | TableView | null,
): PositionMarker | null {
  if (view === null) return null;
  // Heads-up is a property of the deal, not of who is still live: folds never
  // change it, so this reads the same in every phase of the hand.
  const headsUp = view.phase !== "no-hand" && view.dealtSeatCount === 2;
  if (view.phase === "no-hand" || headsUp) {
    return seatId === view.button ? "button" : null;
  }
  if (seatId === view.button) return "button";
  if (seatId === view.smallBlind) return "small-blind";
  if (seatId === view.bigBlind) return "big-blind";
  return null;
}
