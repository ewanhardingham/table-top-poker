import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { apply } from "./apply.js";
import { createInitialState } from "./room.js";
import { decide } from "./decide.js";
import { legalActions } from "./table.js";
import { playAll } from "./test-utils.js";
import type { EngineState, HandEvent } from "./types.js";

function applyEvents(state: EngineState, events: HandEvent[]): EngineState {
  let next = state;
  for (const event of events) next = apply(next, event);
  return next;
}

describe("eviction command", () => {
  it("preserves the current actor for every supported multi-seat ring", () => {
    fc.assert(
      fc.property(
        fc.uniqueArray(fc.integer({ min: 0, max: 7 }), {
          minLength: 3,
          maxLength: 8,
        }),
        fc.string({ minLength: 1, maxLength: 10 }),
        (seats, seed) => {
          const firstSeat = seats[0];
          if (firstSeat === undefined) {
            throw new Error("expected at least one seat");
          }
          let state = createInitialState(seats);
          state = playAll(state, [
            { type: "startHand", seatId: firstSeat, seed },
          ]);
          if (state.hand?.status !== "betting") {
            throw new Error("expected a betting hand");
          }

          const actor = state.hand.toAct[0];
          const evicted = state.hand.toAct[1];
          if (actor === undefined || evicted === undefined) {
            throw new Error("expected two seats to be awaiting action");
          }
          const result = decide(state, { type: "evict", seatId: evicted });
          if (!Array.isArray(result)) {
            throw new Error("expected eviction events");
          }
          const next = applyEvents(state, result);
          if (next.hand?.status !== "betting") {
            throw new Error("expected the hand to continue");
          }

          expect(next.hand.toAct[0]).toBe(actor);
          expect(next.hand.toAct).not.toContain(evicted);
          expect(next.hand.players.get(evicted)?.folded).toBe(true);
        },
      ),
    );
  });

  it("folds a later seat without moving the current actor", () => {
    let state = createInitialState([0, 1, 2]);
    state = playAll(state, [
      { type: "startHand", seatId: 0, seed: "eviction" },
    ]);
    if (state.hand?.status !== "betting") {
      throw new Error("expected a betting hand");
    }

    const actor = state.hand.toAct[0];
    const evicted = state.hand.toAct[1];
    if (actor === undefined || evicted === undefined) {
      throw new Error("expected two seats to be awaiting action");
    }

    const result = decide(state, { type: "evict", seatId: evicted });
    if (!Array.isArray(result)) throw new Error("expected eviction events");

    expect(result).toEqual([
      { type: "ActionTaken", seatId: evicted, action: "fold" },
    ]);
    state = applyEvents(state, result);

    if (state.hand?.status !== "betting") {
      throw new Error("expected the hand to continue");
    }
    expect(state.hand.toAct[0]).toBe(actor);
    expect(state.hand.toAct).not.toContain(evicted);
    expect(state.hand.players.get(evicted)?.folded).toBe(true);

    const currentAction = legalActions(state.hand, actor)[0];
    if (currentAction === undefined) {
      throw new Error("expected the current actor to retain legal actions");
    }
    expect(decide(state, { type: currentAction, seatId: actor })).toEqual(
      expect.any(Array),
    );
  });

  it("completes a heads-up hand when the non-current seat is evicted", () => {
    let state = createInitialState([0, 1]);
    state = playAll(state, [
      { type: "startHand", seatId: 0, seed: "eviction-heads-up" },
    ]);
    if (state.hand?.status !== "betting") {
      throw new Error("expected a betting hand");
    }

    const actor = state.hand.toAct[0];
    const evicted = state.hand.toAct[1];
    if (actor === undefined || evicted === undefined) {
      throw new Error("expected both seats to be awaiting action");
    }

    const result = decide(state, { type: "evict", seatId: evicted });
    if (!Array.isArray(result)) throw new Error("expected eviction events");

    expect(result.map((event) => event.type)).toEqual([
      "ActionTaken",
      "HandFoldedOut",
      "HandComplete",
    ]);
    state = applyEvents(state, result);

    expect(state.hand?.status).toBe("complete");
    if (
      state.hand?.status !== "complete" ||
      state.hand.reason !== "folded-out"
    ) {
      throw new Error("expected a folded-out hand");
    }
    expect(state.hand.winner).toBe(actor);
  });
});
