import { describe, expect, it } from "vitest";
import { createInitialState } from "./room.js";
import { playAll } from "./test-utils.js";

describe("CompleteHandState carries how the hand ended", () => {
  it("tags a fold-out completion with reason 'folded-out' and the winner", () => {
    let state = createInitialState([0, 1, 2]);
    state = playAll(state, [{ type: "startHand", seatId: 0, seed: "foldout" }]);
    // Preflop runs button, SB, BB — the BB is left holding the pot.
    state = playAll(state, [
      { type: "fold", seatId: 0 },
      { type: "fold", seatId: 1 },
    ]);

    if (state.hand?.status !== "complete") throw new Error("expected complete");
    expect(state.hand.reason).toBe("folded-out");
    if (state.hand.reason === "folded-out") {
      expect(state.hand.winner).toBe(2);
    }
  });

  it("tags a showdown completion with reason 'showdown' plus results and winners", () => {
    let state = createInitialState([0, 1]);
    state = playAll(state, [{ type: "startHand", seatId: 0, seed: "s0" }]);
    state = playAll(state, [
      { type: "call", seatId: 0 },
      { type: "check", seatId: 1 },
      { type: "check", seatId: 1 },
      { type: "check", seatId: 0 },
      { type: "check", seatId: 1 },
      { type: "check", seatId: 0 },
      { type: "check", seatId: 1 },
      { type: "check", seatId: 0 },
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

  it("carries the full five-card board on a showdown completion", () => {
    let state = createInitialState([0, 1]);
    state = playAll(state, [{ type: "startHand", seatId: 0, seed: "s0" }]);
    state = playAll(state, [
      { type: "call", seatId: 0 },
      { type: "check", seatId: 1 },
      { type: "check", seatId: 1 },
      { type: "check", seatId: 0 },
      { type: "check", seatId: 1 },
      { type: "check", seatId: 0 },
      { type: "check", seatId: 1 },
      { type: "check", seatId: 0 },
    ]);

    if (state.hand?.status !== "complete") throw new Error("expected complete");
    if (state.hand.reason !== "showdown") throw new Error("expected showdown");
    expect(state.hand.board).toHaveLength(5);
  });
});
