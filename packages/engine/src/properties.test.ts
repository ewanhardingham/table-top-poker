import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { apply } from "./apply.js";
import { decide } from "./decide.js";
import { createInitialState } from "./room.js";
import type { ActionType, BettingHandState, EngineState } from "./types.js";
import { must } from "./util.js";

const seatsArb = fc
  .array(fc.integer({ min: 0, max: 7 }), { minLength: 2, maxLength: 8 })
  .map((raw) => [...new Set(raw)])
  .filter((seats) => seats.length >= 2);

const actionArb = fc.constantFrom<"fold" | "check" | "call" | "raise">(
  "fold",
  "check",
  "call",
  "raise",
);

/**
 * Deep-freezes state so any in-place mutation throws (ES modules are always
 * strict mode) — a stronger check than snapshot-and-compare, since it also
 * catches mutation of a nested object that later gets discarded unread.
 */
function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    if (value instanceof Map) {
      for (const entry of value.values()) deepFreeze(entry);
    } else {
      for (const child of Object.values(value)) deepFreeze(child);
    }
  }
  return value;
}

describe("property: same seed produces the same deal", () => {
  it("HoleCardsDealt is identical for two hands started with the same seed", () => {
    fc.assert(
      fc.property(
        seatsArb,
        fc.string({ minLength: 1, maxLength: 20 }),
        (seats, seed) => {
          const dealOf = () => {
            const state = createInitialState(seats);
            const result = decide(state, {
              type: "startHand",
              playerId: must(seats[0]),
              seed,
            });
            if (!Array.isArray(result)) throw new Error("unexpected rejection");
            const dealt = result.find((e) => e.type === "HoleCardsDealt");
            if (dealt?.type !== "HoleCardsDealt") throw new Error("no deal");
            return dealt.deals;
          };

          expect(dealOf()).toEqual(dealOf());
        },
      ),
    );
  });
});

describe("property: a rejected command never mutates state", () => {
  it("state is unchanged before any hand has started", () => {
    fc.assert(
      fc.property(
        seatsArb,
        actionArb,
        fc.integer({ min: 0, max: 7 }),
        (seats, action, playerId) => {
          const before = deepFreeze(createInitialState(seats));
          const result = decide(before, { type: action, playerId });
          expect(Array.isArray(result)).toBe(false);
        },
      ),
    );
  });

  it("a not-your-turn rejection never mutates the in-progress hand's state", () => {
    fc.assert(
      fc.property(seatsArb, actionArb, (seats, action) => {
        let state: EngineState = createInitialState(seats);
        const started = decide(state, {
          type: "startHand",
          playerId: must(seats[0]),
          seed: "prop-seed",
        });
        if (!Array.isArray(started)) throw new Error("unexpected rejection");
        for (const event of started) {
          state = apply(state, event);
        }

        if (state.hand?.status !== "betting") {
          throw new Error("expected betting");
        }
        const actor = must(state.hand.toAct[0]);
        const wrongPlayer = must(seats.find((seat) => seat !== actor));

        const frozen = deepFreeze(state);
        const result = decide(frozen, { type: action, playerId: wrongPlayer });

        expect(Array.isArray(result)).toBe(false);
        if (!Array.isArray(result)) {
          expect(result.reason).toBe("not-your-turn");
        }
      }),
    );
  });
});

function legalActionsFor(hand: BettingHandState): ActionType[] {
  return hand.raiseOccurred
    ? ["fold", "call", "raise"]
    : ["fold", "check", "raise"];
}

function assertBettingInvariants(hand: BettingHandState): void {
  expect(hand.toAct.length).toBeGreaterThan(0);

  const seen = new Set<number>();
  for (const seat of hand.toAct) {
    expect(seen.has(seat)).toBe(false);
    seen.add(seat);
    expect(must(hand.players.get(seat)).folded).toBe(false);
  }

  const live = hand.ring.filter((seat) => !must(hand.players.get(seat)).folded);
  expect(live.length).toBeGreaterThanOrEqual(2);
}

describe("property: decide/apply keep the betting invariants across a random hand", () => {
  it("toAct always has an actor, no duplicates, no folded seats, and >=2 live", () => {
    fc.assert(
      fc.property(
        seatsArb,
        fc.string({ minLength: 1, maxLength: 10 }),
        fc.array(fc.nat(2), { minLength: 0, maxLength: 60 }),
        (seats, seed, choices) => {
          let state: EngineState = createInitialState(seats);
          const started = decide(state, {
            type: "startHand",
            playerId: must(seats[0]),
            seed,
          });
          if (!Array.isArray(started)) throw new Error("unexpected rejection");
          for (const event of started) state = apply(state, event);
          if (state.hand?.status === "betting") {
            assertBettingInvariants(state.hand);
          }

          for (const choice of choices) {
            if (state.hand?.status !== "betting") break;
            const hand = state.hand;
            const actor = must(hand.toAct[0]);
            const options = legalActionsFor(hand);
            const action = must(options[choice % options.length]);

            const result = decide(state, { type: action, playerId: actor });
            if (!Array.isArray(result)) {
              throw new Error(`unexpected rejection: ${result.reason}`);
            }
            for (const event of result) state = apply(state, event);
            if (state.hand?.status === "betting") {
              assertBettingInvariants(state.hand);
            }
          }
        },
      ),
    );
  });
});
