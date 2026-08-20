import type { HandEvent, SeatId } from "@table-top-poker/engine";
import type { HandStartContext } from "./records.js";

/** Just enough of an `EngineState` to say where a Hand is being dealt from. */
export interface HandPositions {
  readonly seats: readonly SeatId[];
  readonly button: SeatId;
}

/**
 * Keyed on a generated `HandStarted`, never the Command's type — a *rejected*
 * `nextHand` looks the same. `startedAt` is read here, as the operation is
 * staged, so it records when the Hand began rather than when its append landed.
 */
export function handStartContextFor(
  events: readonly HandEvent[],
  positions: HandPositions,
  now: () => Date,
): HandStartContext | undefined {
  if (!events.some((event) => event.type === "HandStarted")) return undefined;
  return {
    startedAt: now().toISOString(),
    seats: positions.seats,
    button: positions.button,
  };
}
