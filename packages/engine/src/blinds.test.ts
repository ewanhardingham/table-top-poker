import { describe, expect, it } from "vitest";
import { createInitialState } from "./room.js";
import { bigBlindSeat, smallBlindSeat } from "./table.js";
import { playAll } from "./test-utils.js";
import type { EngineState } from "./types.js";
import { view } from "./view.js";

function bettingView(state: EngineState) {
  const v = view(state, "table");
  if (v.phase !== "betting") throw new Error("expected a betting view");
  return v;
}

describe("smallBlindSeat", () => {
  it("is the seat immediately after the button in ring order, not by seat number", () => {
    // Seat 5 has the button; ring order wraps to seat 1 before seat 3.
    expect(smallBlindSeat([1, 3, 5], 5)).toBe(1);
    expect(bigBlindSeat([1, 3, 5], 5)).toBe(3);
  });

  it("is the button itself heads-up", () => {
    expect(smallBlindSeat([4, 2], 2)).toBe(2);
    expect(bigBlindSeat([4, 2], 2)).toBe(4);
  });
});

describe("view: blinds during betting", () => {
  it("reports the blinds by ring order for a three-handed hand", () => {
    // Seats 2, 5, 7 with the button on 5: ring = [7, 2, 5].
    let state = createInitialState([2, 5, 7]);
    state = { ...state, button: 5 };
    state = playAll(state, [{ type: "startHand", seatId: 2, seed: "blinds" }]);

    const v = bettingView(state);
    expect(v.button).toBe(5);
    expect(v.smallBlind).toBe(7);
    expect(v.bigBlind).toBe(2);
    expect(v.dealtSeatCount).toBe(3);
  });

  it("reports the heads-up truth honestly: the button is also the small blind", () => {
    let state = createInitialState([0, 1]);
    state = playAll(state, [{ type: "startHand", seatId: 0, seed: "hu" }]);

    const v = bettingView(state);
    expect(v.button).toBe(0);
    expect(v.smallBlind).toBe(0);
    expect(v.bigBlind).toBe(1);
    expect(v.dealtSeatCount).toBe(2);
  });

  it("keeps the blinds fixed for the hand when a seat folds", () => {
    let state = createInitialState([0, 1, 2]);
    state = playAll(state, [{ type: "startHand", seatId: 0, seed: "fixed" }]);
    const before = bettingView(state);
    state = playAll(state, [{ type: "fold", seatId: 1 }]);
    const after = bettingView(state);

    expect(after.smallBlind).toBe(before.smallBlind);
    expect(after.bigBlind).toBe(before.bigBlind);
    expect(after.dealtSeatCount).toBe(before.dealtSeatCount);
  });
});

describe("view: blinds on a completed hand", () => {
  it("a folded-out hand keeps the ids the betting hand had, despite the button rotating", () => {
    let state = createInitialState([0, 1, 2]);
    state = playAll(state, [{ type: "startHand", seatId: 0, seed: "foldout" }]);
    const betting = bettingView(state);

    state = playAll(state, [
      { type: "fold", seatId: 1 },
      { type: "fold", seatId: 2 },
    ]);

    // `HandComplete` has rotated the engine button on to the next seat, but
    // the completed hand still describes the hand that was just played.
    expect(state.button).not.toBe(betting.button);

    const v = view(state, "table");
    if (v.phase !== "folded-out") throw new Error("expected folded-out");
    expect(v.button).toBe(betting.button);
    expect(v.smallBlind).toBe(betting.smallBlind);
    expect(v.bigBlind).toBe(betting.bigBlind);
    expect(v.dealtSeatCount).toBe(3);
  });

  it("a showdown hand keeps the ids the betting hand had", () => {
    let state = createInitialState([0, 1, 2]);
    state = playAll(state, [{ type: "startHand", seatId: 0, seed: "sd" }]);
    const betting = bettingView(state);

    state = playAll(state, [
      { type: "call", seatId: 1 },
      { type: "check", seatId: 2 },
      { type: "call", seatId: 0 },
      { type: "check", seatId: 2 },
      { type: "check", seatId: 1 },
      { type: "check", seatId: 2 },
      { type: "check", seatId: 0 },
      { type: "check", seatId: 1 },
      { type: "check", seatId: 2 },
      { type: "check", seatId: 0 },
      { type: "check", seatId: 1 },
      { type: "check", seatId: 2 },
      { type: "check", seatId: 0 },
    ]);

    const v = view(state, "table");
    if (v.phase !== "showdown") throw new Error("expected showdown");
    expect(v.button).toBe(betting.button);
    expect(v.smallBlind).toBe(betting.smallBlind);
    expect(v.bigBlind).toBe(betting.bigBlind);
    expect(v.dealtSeatCount).toBe(3);
  });

  it("a heads-up showdown still reports the button as the small blind", () => {
    let state = createInitialState([0, 1]);
    state = playAll(state, [{ type: "startHand", seatId: 0, seed: "hu-sd" }]);
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

    const v = view(state, "table");
    if (v.phase !== "showdown") throw new Error("expected showdown");
    expect(v.smallBlind).toBe(v.button);
    expect(v.bigBlind).toBe(1);
    expect(v.dealtSeatCount).toBe(2);
  });
});

describe("view: between hands", () => {
  it("reports only the button — the blinds do not exist without a hand", () => {
    const state = createInitialState([0, 1, 2]);
    const v = view(state, "table");
    expect(v.phase).toBe("no-hand");
    expect(v).not.toHaveProperty("smallBlind");
    expect(v).not.toHaveProperty("bigBlind");
  });
});
