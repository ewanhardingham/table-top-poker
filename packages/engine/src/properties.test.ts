import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { apply } from "./apply.js";
import { decide } from "./decide.js";
import { createInitialState } from "./room.js";
import { legalActions } from "./table.js";
import type {
  ActionType,
  BettingHandState,
  Card,
  EngineState,
  HandEvent,
} from "./types.js";
import { must } from "./util.js";

const seatsArb = fc
  .array(fc.integer({ min: 0, max: 7 }), { minLength: 2, maxLength: 8 })
  .map((raw) => [...new Set(raw)])
  .filter((seats) => seats.length >= 2);

const actionArb = fc.constantFrom<ActionType>(
  "fold",
  "check",
  "call",
  "raise",
  "allInCall",
  "allInRaise",
);

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
              seatId: must(seats[0]),
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
        (seats, action, seatId) => {
          const before = deepFreeze(createInitialState(seats));
          const result = decide(before, { type: action, seatId });
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
          seatId: must(seats[0]),
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
        const result = decide(frozen, { type: action, seatId: wrongPlayer });

        expect(Array.isArray(result)).toBe(false);
        if (!Array.isArray(result)) {
          expect(result.reason).toBe("not-your-turn");
        }
      }),
    );
  });
});

function assertBettingInvariants(hand: BettingHandState): void {
  expect(hand.toAct.length).toBeGreaterThan(0);

  const seen = new Set<number>();
  for (const seat of hand.toAct) {
    expect(seen.has(seat)).toBe(false);
    seen.add(seat);
    expect(must(hand.players.get(seat)).folded).toBe(false);
    expect(must(hand.players.get(seat)).allIn).toBe(false);
  }

  const live = hand.ring.filter((seat) => !must(hand.players.get(seat)).folded);
  expect(live.length).toBeGreaterThanOrEqual(2);
}

describe("property: decide/apply keep the betting invariants across a random hand", () => {
  it("toAct always has an actor, no duplicates, nobody folded or all-in, and >=2 live", () => {
    fc.assert(
      fc.property(
        seatsArb,
        fc.string({ minLength: 1, maxLength: 10 }),
        fc.array(fc.nat(4), { minLength: 0, maxLength: 60 }),
        (seats, seed, choices) => {
          let state: EngineState = createInitialState(seats);
          const started = decide(state, {
            type: "startHand",
            seatId: must(seats[0]),
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
            const options = legalActions(hand, actor);
            const action = must(options[choice % options.length]);

            const result = decide(state, { type: action, seatId: actor });
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

function dealtCardsOf(events: readonly HandEvent[]): Card[] {
  return events.flatMap((event) => {
    if (event.type === "HoleCardsDealt") {
      return event.deals.flatMap((deal) => [...deal.cards]);
    }
    if (event.type === "BoardDealt") return event.cards;
    if (event.type === "CardBurned")
      return event.card === null ? [] : [event.card];
    return [];
  });
}

describe("property: no card is ever dealt twice", () => {
  it("hole cards, burns and the board are all distinct across a random hand", () => {
    fc.assert(
      fc.property(
        seatsArb,
        fc.string({ minLength: 1, maxLength: 10 }),
        fc.array(fc.nat(4), { minLength: 0, maxLength: 60 }),
        (seats, seed, choices) => {
          let state: EngineState = createInitialState(seats);
          const events: HandEvent[] = [];

          const started = decide(state, {
            type: "startHand",
            seatId: must(seats[0]),
            seed,
          });
          if (!Array.isArray(started)) throw new Error("unexpected rejection");
          for (const event of started) {
            events.push(event);
            state = apply(state, event);
          }

          for (const choice of choices) {
            if (state.hand?.status !== "betting") break;
            const hand = state.hand;
            const actor = must(hand.toAct[0]);
            const options = legalActions(hand, actor);
            const action = must(options[choice % options.length]);

            const result = decide(state, { type: action, seatId: actor });
            if (!Array.isArray(result)) {
              throw new Error(`unexpected rejection: ${result.reason}`);
            }
            for (const event of result) {
              events.push(event);
              state = apply(state, event);
            }
          }

          const dealt = dealtCardsOf(events);
          const distinct = new Set(
            dealt.map((card) => `${card.rank}-${card.suit}`),
          );
          expect(distinct.size).toBe(dealt.length);
        },
      ),
    );
  });
});

describe("property: a hand burns once per street dealt", () => {
  it("the burn count always matches the streets the board reached", () => {
    fc.assert(
      fc.property(
        seatsArb,
        fc.string({ minLength: 1, maxLength: 10 }),
        fc.array(fc.nat(4), { minLength: 0, maxLength: 60 }),
        (seats, seed, choices) => {
          let state: EngineState = createInitialState(seats);
          const events: HandEvent[] = [];

          const started = decide(state, {
            type: "startHand",
            seatId: must(seats[0]),
            seed,
          });
          if (!Array.isArray(started)) throw new Error("unexpected rejection");
          for (const event of started) {
            events.push(event);
            state = apply(state, event);
          }

          for (const choice of choices) {
            if (state.hand?.status !== "betting") break;
            const hand = state.hand;
            const actor = must(hand.toAct[0]);
            const options = legalActions(hand, actor);
            const action = must(options[choice % options.length]);

            const result = decide(state, { type: action, seatId: actor });
            if (!Array.isArray(result)) {
              throw new Error(`unexpected rejection: ${result.reason}`);
            }
            for (const event of result) {
              events.push(event);
              state = apply(state, event);
            }
          }

          const burns = events.filter((event) => event.type === "CardBurned");
          const boardDeals = events.filter(
            (event) => event.type === "BoardDealt",
          );
          expect(burns.length).toBe(boardDeals.length);
          expect(burns.length).toBeLessThanOrEqual(3);
          for (const [index, burn] of burns.entries()) {
            expect(burn.street).toBe(must(boardDeals[index]).street);
          }
        },
      ),
    );
  });
});
