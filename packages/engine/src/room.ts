import type { EngineState, SeatId } from "./types.js";
import { must } from "./util.js";

export function createInitialState(seats: readonly SeatId[]): EngineState {
  if (seats.length < 2 || seats.length > 8) {
    throw new Error("a room needs between 2 and 8 seated players");
  }
  return { seats: [...seats], button: must(seats[0]), hand: null };
}
