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
    state = playAll(state, [{ type: "startHand", playerId: 0, seed: "hu" }]);

    // Button (0) is also the Small Blind and acts first preflop — they face
    // the BB's post, so they must call/fold/raise, not check; only the BB
    // (seat 1) can check an unraised preflop.
    expect(betting(state).street).toBe("preflop");
    expect(betting(state).toAct).toEqual([0, 1]);

    state = playAll(state, [
      { type: "call", playerId: 0 },
      { type: "check", playerId: 1 },
    ]);

    // Postflop: the non-button seat (BB) now acts first, button last.
    expect(betting(state).street).toBe("flop");
    expect(betting(state).toAct).toEqual([1, 0]);

    state = playAll(state, [
      { type: "check", playerId: 1 },
      { type: "check", playerId: 0 },
    ]);
    expect(betting(state).street).toBe("turn");
    expect(betting(state).toAct).toEqual([1, 0]);
  });
});
