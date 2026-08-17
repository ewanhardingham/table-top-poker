import type { PlayerView, SeatId, TableView } from "@table-top-poker/protocol";
import { color } from "./theme.js";

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

export function positionMarkerFor(
  seatId: SeatId,
  view: PlayerView | TableView | null,
): PositionMarker | null {
  if (view === null) return null;
  const headsUp = view.phase !== "no-hand" && view.dealtSeatCount === 2;
  if (view.phase === "no-hand" || headsUp) {
    return seatId === view.button ? "button" : null;
  }
  if (seatId === view.button) return "button";
  if (seatId === view.smallBlind) return "small-blind";
  if (seatId === view.bigBlind) return "big-blind";
  return null;
}
