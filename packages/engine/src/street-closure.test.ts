import { describe, expect, it } from "vitest";
import { createInitialState } from "./room.js";
import { bigBlindSeat, smallBlindSeat } from "./table.js";
import { play, playAll } from "./test-utils.js";
import type { EngineState, SeatId } from "./types.js";

function street(state: ReturnType<typeof createInitialState>) {
  if (state.hand?.status !== "betting") throw new Error("expected betting");
  return state.hand;
}

function actor(state: EngineState): SeatId {
  const [next] = street(state).toAct;
  if (next === undefined) throw new Error("expected an actor");
  return next;
}

describe("street closure — limped-around preflop", () => {
  it("closes after one lap ending on the BB, with nobody raising", () => {
    // 3 seats; button 0, small blind 1, big blind 2. Preflop opens on the
    // first seat left of the blinds, which three-handed is the button.
    const BUTTON = 0;
    const SB = 1;
    const BB = 2;

    let state = createInitialState([BUTTON, SB, BB]);
    state = playAll(state, [
      { type: "startHand", seatId: BUTTON, seed: "limp" },
    ]);
    expect(street(state).toAct).toEqual([BUTTON, SB, BB]);

    // Only the BB may check an unraised preflop; everyone else calls.
    state = playAll(state, [{ type: "call", seatId: BUTTON }]);
    expect(street(state).street).toBe("preflop");
    expect(street(state).toAct).toEqual([SB, BB]);

    state = playAll(state, [{ type: "call", seatId: SB }]);
    expect(street(state).street).toBe("preflop");
    expect(street(state).toAct).toEqual([BB]);

    // The BB's option is simply their turn, and it is the last one — no
    // second visit, and checking it closes preflop.
    state = playAll(state, [{ type: "check", seatId: BB }]);
    expect(street(state).street).toBe("flop");
  });

  it("rejects the small blind trying to open preflop", () => {
    // The reported production bug: preflop opened on the small blind.
    const BUTTON = 0;
    const SB = 1;
    const BB = 2;

    let state = createInitialState([BUTTON, SB, BB]);
    state = playAll(state, [
      { type: "startHand", seatId: BUTTON, seed: "sb-out-of-turn" },
    ]);

    const outcome = play(state, { type: "call", seatId: SB });
    if (!("rejection" in outcome)) {
      throw new Error("expected the small blind's open to be rejected");
    }
    expect(outcome.rejection.reason).toBe("not-your-turn");
  });

  it("gives a folding BB no phantom extra turn", () => {
    const BUTTON = 0;
    const SB = 1;
    const BB = 2;

    let state = createInitialState([BUTTON, SB, BB]);
    state = playAll(state, [
      { type: "startHand", seatId: BUTTON, seed: "bb-folds" },
      { type: "call", seatId: BUTTON },
      { type: "call", seatId: SB },
    ]);
    expect(street(state).toAct).toEqual([BB]);

    // Folding the option closes preflop exactly as checking it would; the
    // BB must not be re-queued behind their own fold.
    state = playAll(state, [{ type: "fold", seatId: BB }]);
    expect(street(state).street).toBe("flop");
    expect(street(state).toAct).toEqual([SB, BUTTON]);
  });

  it("takes exactly one action per live seat, BB last, at every field size", () => {
    for (let n = 2; n <= 8; n++) {
      const seats: SeatId[] = Array.from({ length: n }, (_, i) => i);
      let state = createInitialState(seats);
      state = playAll(state, [
        { type: "startHand", seatId: 0, seed: `limp-${String(n)}` },
      ]);
      const ring = street(state).ring;
      const bigBlind = bigBlindSeat(ring, 0);
      const smallBlind = smallBlindSeat(ring, 0);

      // Preflop never opens on either blind with 3+ seats; heads-up the
      // small blind is on the button and opens by rule.
      expect(actor(state)).not.toBe(bigBlind);
      if (n > 2) expect(actor(state)).not.toBe(smallBlind);

      const acted: SeatId[] = [];
      while (street(state).street === "preflop") {
        const seatId = actor(state);
        acted.push(seatId);
        state = playAll(state, [
          seatId === bigBlind
            ? { type: "check", seatId }
            : { type: "call", seatId },
        ]);
      }

      expect(acted).toHaveLength(n);
      expect(new Set(acted).size).toBe(n);
      expect(acted[n - 1]).toBe(bigBlind);
      expect(street(state).street).toBe("flop");
    }
  });
});

describe("street closure — raised and called", () => {
  it("closes as soon as action returns to the raiser with no further raise", () => {
    const BUTTON = 0;
    const SB = 1;
    const BB = 2;

    let state = createInitialState([BUTTON, SB, BB]);
    state = playAll(state, [
      { type: "startHand", seatId: BUTTON, seed: "raised" },
    ]);

    // Button calls, SB raises mid-lap — the requeue runs in ring order from
    // the raiser, so the BB (who had not yet acted) still gets their turn.
    state = playAll(state, [
      { type: "call", seatId: BUTTON },
      { type: "raise", seatId: SB },
    ]);
    expect(street(state).toAct).toEqual([BB, BUTTON]);

    state = playAll(state, [{ type: "call", seatId: BB }]);
    expect(street(state).street).toBe("preflop");
    expect(street(state).toAct).toEqual([BUTTON]);

    state = playAll(state, [{ type: "call", seatId: BUTTON }]);
    expect(street(state).street).toBe("flop");
  });

  it("re-opens the action again on a re-raise", () => {
    const BUTTON = 0;
    const SB = 1;
    const BB = 2;

    let state = createInitialState([BUTTON, SB, BB]);
    state = playAll(state, [
      { type: "startHand", seatId: BUTTON, seed: "reraise" },
    ]);

    state = playAll(state, [
      { type: "call", seatId: BUTTON },
      { type: "raise", seatId: SB },
      { type: "raise", seatId: BB },
    ]);
    // BB re-raised: only the button and SB owe a response now, in that order.
    expect(street(state).toAct).toEqual([BUTTON, SB]);

    state = playAll(state, [
      { type: "call", seatId: BUTTON },
      { type: "call", seatId: SB },
    ]);
    expect(street(state).street).toBe("flop");
  });

  it("requeues correctly when the raiser is the BB and an earlier seat already folded", () => {
    // 4 seats; button 0, small blind 1, big blind 2, UTG 3 — so preflop
    // runs UTG, button, SB, BB.
    const BUTTON = 0;
    const SB = 1;
    const BB = 2;
    const UTG = 3;

    let state = createInitialState([BUTTON, SB, BB, UTG]);
    state = playAll(state, [
      { type: "startHand", seatId: BUTTON, seed: "bb-raise" },
    ]);
    expect(street(state).toAct).toEqual([UTG, BUTTON, SB, BB]);

    state = playAll(state, [
      { type: "call", seatId: UTG },
      { type: "call", seatId: BUTTON },
      { type: "fold", seatId: SB },
      { type: "raise", seatId: BB },
    ]);
    // SB already folded, so only UTG and the button owe a response.
    expect(street(state).toAct).toEqual([UTG, BUTTON]);

    state = playAll(state, [
      { type: "call", seatId: UTG },
      { type: "call", seatId: BUTTON },
    ]);
    expect(street(state).street).toBe("flop");
  });
});
