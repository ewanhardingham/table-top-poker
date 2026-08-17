import { describe, expect, it } from "vitest";
import { createInitialState } from "./room.js";
import { playAll } from "./test-utils.js";

function betting(state: ReturnType<typeof createInitialState>) {
  if (state.hand?.status !== "betting") throw new Error("expected betting");
  return state.hand;
}

describe("heads-up (2 live players)", () => {
  it("has the button act first preflop, last on every later street", () => {
    let state = createInitialState([0, 1]);
    state = playAll(state, [{ type: "startHand", seatId: 0, seed: "hu" }]);

    expect(betting(state).street).toBe("preflop");
    expect(betting(state).toAct).toEqual([0, 1]);

    state = playAll(state, [
      { type: "call", seatId: 0 },
      { type: "check", seatId: 1 },
    ]);

    expect(betting(state).street).toBe("flop");
    expect(betting(state).toAct).toEqual([1, 0]);

    state = playAll(state, [
      { type: "check", seatId: 1 },
      { type: "check", seatId: 0 },
    ]);
    expect(betting(state).street).toBe("turn");
    expect(betting(state).toAct).toEqual([1, 0]);
  });
});
