import { describe, expect, it } from "vitest";
import { createInitialState } from "./room.js";
import { playAll } from "./test-utils.js";

describe("CompleteHandState carries how the hand ended", () => {
  it("tags a fold-out completion with reason 'folded-out' and the winner", () => {
    let state = createInitialState([0, 1, 2]);
    state = playAll(state, [
      { type: "startHand", playerId: 0, seed: "foldout" },
    ]);
    state = playAll(state, [
      { type: "fold", playerId: 1 },
      { type: "fold", playerId: 2 },
    ]);

    if (state.hand?.status !== "complete") throw new Error("expected complete");
    expect(state.hand.reason).toBe("folded-out");
    if (state.hand.reason === "folded-out") {
      expect(state.hand.winner).toBe(0);
    }
  });

  it("tags a showdown completion with reason 'showdown' plus results and winners", () => {
    let state = createInitialState([0, 1]);
    state = playAll(state, [{ type: "startHand", playerId: 0, seed: "s0" }]);
    state = playAll(state, [
      { type: "call", playerId: 0 },
      { type: "check", playerId: 1 },
      { type: "check", playerId: 1 },
      { type: "check", playerId: 0 },
      { type: "check", playerId: 1 },
      { type: "check", playerId: 0 },
      { type: "check", playerId: 1 },
      { type: "check", playerId: 0 },
    ]);

    if (state.hand?.status !== "complete") throw new Error("expected complete");
    expect(state.hand.reason).toBe("showdown");
    if (state.hand.reason === "showdown") {
      expect(state.hand.results).toHaveLength(2);
      expect(state.hand.winners.length).toBeGreaterThan(0);
      for (const result of state.hand.results) {
        expect(result.holeCards).toHaveLength(2);
      }
    }
  });
});
