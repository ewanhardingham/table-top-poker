import type { HandEvent, SeatId } from "@table-top-poker/engine";
import type { HandStartContext } from "./records.js";

/** Just enough of an `EngineState` to say where a Hand is being dealt from. */
export interface HandPositions {
  readonly seats: readonly SeatId[];
  readonly button: SeatId;
}

/**
 * The Hand context an operation opens a Hand with, or undefined when it opens
 * none. A Hand recording begins only when `startHand`/`nextHand` is
 * **accepted** (Phase 2 spec #129 §3), so the test is a generated
 * `HandStarted` event — never the Command's type, which is also what a
 * *rejected* `nextHand` looks like.
 *
 * `startedAt` is read here, as the operation is staged, rather than when its
 * append confirms: on a stalling disk those are seconds apart, and this
 * timestamp records when the Hand began for the players.
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
