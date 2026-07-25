import type { EngineState, SeatId } from "./types.js";
import { must } from "./util.js";

/**
 * Builds the initial Room-level state for a fixed set of seated players.
 * Seat claiming/joining (issue #13) is out of scope here — seats are fixed
 * for the state's whole life. The button starts at the first seat and
 * rotates automatically whenever a hand reaches `HAND_COMPLETE`.
 */
export function createInitialState(seats: readonly SeatId[]): EngineState {
  if (seats.length < 2 || seats.length > 8) {
    throw new Error("a room needs between 2 and 8 seated players");
  }
  return { seats: [...seats], button: must(seats[0]), hand: null };
}
