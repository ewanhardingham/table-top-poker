import { describe, expect, it } from "vitest";
import { createInitialState } from "./room.js";
import { play, playAll } from "./test-utils.js";

describe("rejections", () => {
  it("hand-not-in-progress: an action before any hand has started", () => {
    const state = createInitialState([0, 1, 2]);
    const outcome = play(state, { type: "check", seatId: 0 });
    if (!("rejection" in outcome)) throw new Error("expected a rejection");
    expect(outcome.rejection.reason).toBe("hand-not-in-progress");
  });

  it("hand-already-in-progress: startHand while a hand is running", () => {
    let state = createInitialState([0, 1, 2]);
    state = playAll(state, [{ type: "startHand", seatId: 0, seed: "s" }]);
    const outcome = play(state, { type: "startHand", seatId: 0, seed: "s2" });
    if (!("rejection" in outcome)) throw new Error("expected a rejection");
    expect(outcome.rejection.reason).toBe("hand-already-in-progress");
  });

  it("not-your-turn: acting out of turn", () => {
    let state = createInitialState([0, 1, 2]);
    state = playAll(state, [{ type: "startHand", seatId: 0, seed: "s" }]);
    // Preflop first actor is seat 0 (the button, three-handed), not seat 1.
    const outcome = play(state, { type: "check", seatId: 1 });
    if (!("rejection" in outcome)) throw new Error("expected a rejection");
    expect(outcome.rejection.reason).toBe("not-your-turn");
  });

  it("action-not-legal: checking when a raise is outstanding", () => {
    let state = createInitialState([0, 1, 2]);
    state = playAll(state, [{ type: "startHand", seatId: 0, seed: "s" }]);
    state = playAll(state, [
      { type: "call", seatId: 0 },
      { type: "raise", seatId: 1 },
    ]);
    const outcome = play(state, { type: "check", seatId: 2 });
    if (!("rejection" in outcome)) throw new Error("expected a rejection");
    expect(outcome.rejection.reason).toBe("action-not-legal");
  });

  it("action-not-legal: checking preflop when you're not the big blind", () => {
    // Seat 0 (the button, first to act) faces the BB's post and must
    // call/fold/raise, not check.
    const state = createInitialState([0, 1, 2]);
    const started = playAll(state, [
      { type: "startHand", seatId: 0, seed: "s" },
    ]);
    const outcome = play(started, { type: "check", seatId: 0 });
    if (!("rejection" in outcome)) throw new Error("expected a rejection");
    expect(outcome.rejection.reason).toBe("action-not-legal");
  });

  it("action-not-legal: calling when there's nothing to call", () => {
    // The BB has nothing to call on an unraised preflop — only check/raise.
    let state = createInitialState([0, 1, 2]);
    state = playAll(state, [{ type: "startHand", seatId: 0, seed: "s" }]);
    state = playAll(state, [
      { type: "call", seatId: 0 },
      { type: "call", seatId: 1 },
    ]);
    const outcome = play(state, { type: "call", seatId: 2 });
    if (!("rejection" in outcome)) throw new Error("expected a rejection");
    expect(outcome.rejection.reason).toBe("action-not-legal");
  });
});
