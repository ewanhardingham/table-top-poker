import { describe, expect, it } from "vitest";
import { createInitialState } from "./room.js";
import { playAll } from "./test-utils.js";

function street(state: ReturnType<typeof createInitialState>) {
  if (state.hand?.status !== "betting") throw new Error("expected betting");
  return state.hand;
}

describe("street closure — limped-around preflop", () => {
  it("closes only once the BB has had its option, with nobody raising", () => {
    // 3 seats; button 0, small blind 1, big blind 2.
    const BUTTON = 0;
    const SB = 1;
    const BB = 2;

    let state = createInitialState([BUTTON, SB, BB]);
    state = playAll(state, [
      { type: "startHand", playerId: BUTTON, seed: "limp" },
    ]);

    // SB calls the BB's post (only the BB may check an unraised preflop) —
    // BB hasn't acted yet even though it's technically their normal turn
    // next — confirm the street is still open after the SB.
    state = playAll(state, [{ type: "call", playerId: SB }]);
    expect(street(state).street).toBe("preflop");
    expect(street(state).toAct[0]).toBe(BB);

    // BB checks its first (normal) turn — button hasn't acted yet, so the
    // street must still be open, and BB gets a second "option" visit later.
    state = playAll(state, [{ type: "check", playerId: BB }]);
    expect(street(state).street).toBe("preflop");
    expect(street(state).toAct[0]).toBe(BUTTON);

    // Button calls — completes the first lap. Nobody raised, so the BB's
    // option is still outstanding: the street must NOT close here.
    state = playAll(state, [{ type: "call", playerId: BUTTON }]);
    expect(street(state).street).toBe("preflop");
    expect(street(state).toAct).toEqual([BB]);

    // BB's option: checking now finally closes preflop.
    state = playAll(state, [{ type: "check", playerId: BB }]);
    expect(street(state).street).toBe("flop");
  });
});

describe("street closure — raised and called", () => {
  it("closes as soon as action returns to the raiser with no further raise", () => {
    const BUTTON = 0;
    const SB = 1;
    const BB = 2;

    let state = createInitialState([BUTTON, SB, BB]);
    state = playAll(state, [
      { type: "startHand", playerId: BUTTON, seed: "raised" },
    ]);

    // SB calls, BB raises — action must return to BB to close, skipping the
    // BB-option mechanic entirely since a real raise already happened.
    state = playAll(state, [
      { type: "call", playerId: SB },
      { type: "raise", playerId: BB },
    ]);
    expect(street(state).toAct).toEqual([BUTTON, SB]);

    state = playAll(state, [{ type: "call", playerId: BUTTON }]);
    expect(street(state).street).toBe("preflop");
    expect(street(state).toAct).toEqual([SB]);

    state = playAll(state, [{ type: "call", playerId: SB }]);
    expect(street(state).street).toBe("flop");
  });

  it("re-opens the action again on a re-raise", () => {
    const BUTTON = 0;
    const SB = 1;
    const BB = 2;

    let state = createInitialState([BUTTON, SB, BB]);
    state = playAll(state, [
      { type: "startHand", playerId: BUTTON, seed: "reraise" },
    ]);

    state = playAll(state, [
      { type: "call", playerId: SB },
      { type: "raise", playerId: BB },
      { type: "raise", playerId: BUTTON },
    ]);
    // Button re-raised: only SB and BB owe a response now, in that order.
    expect(street(state).toAct).toEqual([SB, BB]);

    state = playAll(state, [
      { type: "call", playerId: SB },
      { type: "call", playerId: BB },
    ]);
    expect(street(state).street).toBe("flop");
  });

  it("requeues correctly when the raiser is the BB and an earlier seat already folded", () => {
    // 4 seats; button 0, small blind 1, big blind 2, UTG 3.
    const BUTTON = 0;
    const SB = 1;
    const BB = 2;
    const UTG = 3;

    let state = createInitialState([BUTTON, SB, BB, UTG]);
    state = playAll(state, [
      { type: "startHand", playerId: BUTTON, seed: "bb-raise" },
    ]);

    state = playAll(state, [
      { type: "fold", playerId: SB },
      { type: "raise", playerId: BB },
    ]);
    // SB already folded, so only UTG and the button owe a response — the
    // BB-option flag is also moot now, since a real raise already happened.
    expect(street(state).toAct).toEqual([UTG, BUTTON]);
    expect(street(state).bbOptionPending).toBe(false);

    state = playAll(state, [
      { type: "call", playerId: UTG },
      { type: "call", playerId: BUTTON },
    ]);
    expect(street(state).street).toBe("flop");
  });
});
