import { describe, expect, it } from "vitest";
import { createInitialState } from "./room.js";
import { playAll } from "./test-utils.js";

function street(state: ReturnType<typeof createInitialState>) {
  if (state.hand?.status !== "betting") throw new Error("expected betting");
  return state.hand;
}

describe("street closure — limped-around preflop", () => {
  it("closes only once the BB has had its option, with nobody raising", () => {
    // 3 seats, button 0; ring = [1, 2, 0]; BB = seat 2.
    let state = createInitialState([0, 1, 2]);
    state = playAll(state, [{ type: "startHand", playerId: 0, seed: "limp" }]);

    // 1 checks, 2 (BB) hasn't acted yet even though it's technically their
    // normal turn next — confirm the street is still open after seat 1.
    state = playAll(state, [{ type: "check", playerId: 1 }]);
    expect(street(state).street).toBe("preflop");
    expect(street(state).toAct[0]).toBe(2);

    // BB checks its first (normal) turn — button hasn't acted yet, so the
    // street must still be open, and BB gets a second "option" visit later.
    state = playAll(state, [{ type: "check", playerId: 2 }]);
    expect(street(state).street).toBe("preflop");
    expect(street(state).toAct[0]).toBe(0);

    // Button checks — completes the first lap. Nobody raised, so the BB's
    // option is still outstanding: the street must NOT close here.
    state = playAll(state, [{ type: "check", playerId: 0 }]);
    expect(street(state).street).toBe("preflop");
    expect(street(state).toAct).toEqual([2]);

    // BB's option: checking now finally closes preflop.
    state = playAll(state, [{ type: "check", playerId: 2 }]);
    expect(street(state).street).toBe("flop");
  });
});

describe("street closure — raised and called", () => {
  it("closes as soon as action returns to the raiser with no further raise", () => {
    let state = createInitialState([0, 1, 2]);
    state = playAll(state, [
      { type: "startHand", playerId: 0, seed: "raised" },
    ]);

    // 1 checks, 2 (BB) raises — action must return to 2 to close, skipping
    // the BB-option mechanic entirely since a real raise already happened.
    state = playAll(state, [
      { type: "check", playerId: 1 },
      { type: "raise", playerId: 2 },
    ]);
    expect(street(state).toAct).toEqual([0, 1]);

    state = playAll(state, [{ type: "call", playerId: 0 }]);
    expect(street(state).street).toBe("preflop");
    expect(street(state).toAct).toEqual([1]);

    state = playAll(state, [{ type: "call", playerId: 1 }]);
    expect(street(state).street).toBe("flop");
  });

  it("re-opens the action again on a re-raise", () => {
    let state = createInitialState([0, 1, 2]);
    state = playAll(state, [
      { type: "startHand", playerId: 0, seed: "reraise" },
    ]);

    state = playAll(state, [
      { type: "check", playerId: 1 },
      { type: "raise", playerId: 2 },
      { type: "raise", playerId: 0 },
    ]);
    // 0 re-raised: only 1 and 2 owe a response now, in that order.
    expect(street(state).toAct).toEqual([1, 2]);

    state = playAll(state, [
      { type: "call", playerId: 1 },
      { type: "call", playerId: 2 },
    ]);
    expect(street(state).street).toBe("flop");
  });

  it("requeues correctly when the raiser is the BB and an earlier seat already folded", () => {
    // 4 seats, button 0; ring = [1, 2, 3, 0]; BB = seat 2.
    let state = createInitialState([0, 1, 2, 3]);
    state = playAll(state, [
      { type: "startHand", playerId: 0, seed: "bb-raise" },
    ]);

    state = playAll(state, [
      { type: "fold", playerId: 1 },
      { type: "raise", playerId: 2 },
    ]);
    // Seat 1 already folded, so only seats 3 and 0 owe a response — the
    // BB-option flag is also moot now, since a real raise already happened.
    expect(street(state).toAct).toEqual([3, 0]);
    expect(street(state).bbOptionPending).toBe(false);

    state = playAll(state, [
      { type: "call", playerId: 3 },
      { type: "call", playerId: 0 },
    ]);
    expect(street(state).street).toBe("flop");
  });
});
