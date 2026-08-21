import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { apply } from "./apply.js";
import { decide } from "./decide.js";
import { createInitialState } from "./room.js";
import { facingBet } from "./table.js";
import { playAll } from "./test-utils.js";
import type { Card, EngineState, SeatId } from "./types.js";
import { must } from "./util.js";
import { view } from "./view.js";

function headsUpToRiver(seed: string): EngineState {
  let state = createInitialState([0, 1]);
  state = playAll(state, [{ type: "startHand", seatId: 0, seed }]);
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
  return state;
}

function onTheFlopThreeWay(): EngineState {
  let state = createInitialState([0, 1, 2]);
  state = playAll(state, [{ type: "startHand", seatId: 0, seed: "mid" }]);
  state = playAll(state, [
    { type: "call", seatId: 0 },
    { type: "call", seatId: 1 },
    { type: "check", seatId: 2 },
  ]);
  if (state.hand?.status !== "betting" || state.hand.street !== "flop") {
    throw new Error("expected to reach the flop");
  }
  return state;
}

describe("view: unknown seat", () => {
  it("rejects a seat id that isn't seated at the table", () => {
    const state = onTheFlopThreeWay();
    expect(() => view(state, 999)).toThrow(/unknown seat/);
  });

  it("rejects an unknown seat id even before any hand has started", () => {
    const state = createInitialState([0, 1, 2]);
    expect(() => view(state, 999)).toThrow(/unknown seat/);
  });
});

describe("view: own hole cards mid-hand", () => {
  it("a seat sees its own hole cards", () => {
    const state = onTheFlopThreeWay();
    const mine = view(state, 0);
    if (mine.phase !== "betting") throw new Error("expected betting phase");
    expect(mine.yourHoleCards).not.toBeNull();
    expect(mine.yourHoleCards).toHaveLength(2);
  });
});

describe("view: legalActions", () => {
  it("is populated for the seat to act and empty for everyone else", () => {
    const state = onTheFlopThreeWay();
    if (state.hand?.status !== "betting") throw new Error("expected betting");
    const actor = must(state.hand.toAct[0]);

    const actorView = view(state, actor);
    if (actorView.phase !== "betting") throw new Error("expected betting");
    expect(actorView.legalActions).toEqual([
      "fold",
      "check",
      "raise",
      "allInCall",
      "allInRaise",
    ]);

    const other = must(state.hand.ring.find((seat) => seat !== actor));
    const otherView = view(state, other);
    if (otherView.phase !== "betting") throw new Error("expected betting");
    expect(otherView.legalActions).toEqual([]);
  });
});

describe("view: action-clock deadline", () => {
  it("carries the server deadline through player and table betting views", () => {
    const state = onTheFlopThreeWay();
    const turnEndsAt = 1_750_000_000_000;

    const player = view(state, 0, turnEndsAt);
    const table = view(state, "table", turnEndsAt);
    if (player.phase !== "betting" || table.phase !== "betting") {
      throw new Error("expected betting views");
    }
    expect(player.turnEndsAt).toBe(turnEndsAt);
    expect(table.turnEndsAt).toBe(turnEndsAt);
  });

  it("defaults the deadline to null when the clock is disabled", () => {
    const state = onTheFlopThreeWay();
    const table = view(state, "table");
    if (table.phase !== "betting") throw new Error("expected betting view");
    expect(table.turnEndsAt).toBeNull();
  });
});

describe("view: other seats' hole cards mid-hand", () => {
  it("a seat does not see another live seat's hole cards", () => {
    const state = onTheFlopThreeWay();
    if (state.hand?.status !== "betting") throw new Error("expected betting");
    const otherHoleCards = must(must(state.hand.players.get(1)).holeCards);

    const mine = view(state, 0);
    if (mine.phase !== "betting") throw new Error("expected betting phase");
    expect(mine.yourSeatId).toBe(0);
    for (const card of otherHoleCards) {
      expect(JSON.stringify(mine)).not.toContain(JSON.stringify(card));
    }
    for (const seat of mine.seats) {
      expect(seat).not.toHaveProperty("holeCards");
    }
  });
});

describe("view: folded seats", () => {
  it("a folded seat no longer sees its own hole cards", () => {
    let state = onTheFlopThreeWay();
    state = playAll(state, [{ type: "fold", seatId: 1 }]);

    const mine = view(state, 1);
    if (mine.phase !== "betting") throw new Error("expected betting phase");
    expect(mine.yourHoleCards).toBeNull();
  });
});

describe("view: table view", () => {
  it("sees no hole card pre-showdown, even with a board dealt", () => {
    const state = onTheFlopThreeWay();
    if (state.hand?.status !== "betting") throw new Error("expected betting");
    expect(state.hand.board.length).toBeGreaterThan(0);

    const table = view(state, "table");
    expect(table).not.toHaveProperty("results");

    for (const seatState of state.hand.players.values()) {
      if (!seatState.holeCards) continue;
      for (const card of seatState.holeCards) {
        expect(JSON.stringify(table)).not.toContain(JSON.stringify(card));
      }
    }
  });
});

describe("view: post-showdown", () => {
  it("all live seats' cards are visible to every viewer, including the table", () => {
    const state = headsUpToRiver("s0");
    if (state.hand?.status !== "complete" || state.hand.reason !== "showdown") {
      throw new Error("expected a showdown completion");
    }
    const expectedSeats = state.hand.results.map((r) => r.seatId).sort();

    for (const v of [view(state, 0), view(state, 1), view(state, "table")]) {
      if (v.phase !== "showdown") throw new Error("expected showdown phase");
      expect(v.results.map((r) => r.seatId).sort()).toEqual(expectedSeats);
      expect(v.board).toHaveLength(5);
      for (const result of v.results) {
        expect(result.holeCards).toHaveLength(2);
      }
    }
  });

  it("never reveals a folded seat, even at a normal showdown", () => {
    let state = createInitialState([0, 1, 2]);
    state = playAll(state, [{ type: "startHand", seatId: 0, seed: "seed-1" }]);
    state = playAll(state, [
      { type: "call", seatId: 0 },
      { type: "call", seatId: 1 },
      { type: "raise", seatId: 2 },
      { type: "call", seatId: 0 },
      { type: "call", seatId: 1 },
      { type: "check", seatId: 1 },
      { type: "check", seatId: 2 },
      { type: "check", seatId: 0 },
      { type: "fold", seatId: 1 },
      { type: "check", seatId: 2 },
      { type: "check", seatId: 0 },
      { type: "check", seatId: 2 },
      { type: "raise", seatId: 0 },
      { type: "call", seatId: 2 },
    ]);
    if (state.hand?.status !== "complete" || state.hand.reason !== "showdown") {
      throw new Error("expected a showdown completion");
    }

    const table = view(state, "table");
    if (table.phase !== "showdown") throw new Error("expected showdown phase");
    expect(table.results.some((r) => r.seatId === 1)).toBe(false);
  });
});

const seatsArb = fc
  .array(fc.integer({ min: 0, max: 7 }), { minLength: 2, maxLength: 8 })
  .map((raw) => [...new Set(raw)])
  .filter((seats) => seats.length >= 2);

function collectAllCards(value: unknown, into: Card[]): void {
  if (value === null || typeof value !== "object") return;
  if (
    "rank" in (value as Record<string, unknown>) &&
    "suit" in (value as Record<string, unknown>)
  ) {
    into.push(value as Card);
    return;
  }
  for (const child of Object.values(value)) collectAllCards(child, into);
}

const actionArb = fc.constantFrom<"fold" | "check" | "call" | "raise">(
  "fold",
  "check",
  "call",
  "raise",
);

function assertNoLeak(
  state: EngineState,
  dealtCards: ReadonlyMap<SeatId, readonly [Card, Card]>,
  seats: readonly SeatId[],
): void {
  const shown = new Set<SeatId>();
  const contestants = new Set<SeatId>();
  if (state.hand?.status === "complete" && state.hand.reason === "showdown") {
    for (const result of state.hand.results) shown.add(result.seatId);
    for (const c of state.hand.contestants) contestants.add(c.seatId);
  }

  const viewers: (SeatId | "table")[] = [...seats, "table"];
  for (const v of viewers) {
    const rendered = v === "table" ? view(state, "table") : view(state, v);
    const cardsInView: Card[] = [];
    collectAllCards(rendered, cardsInView);
    const cardKeys = new Set(cardsInView.map((c) => `${c.rank}${c.suit}`));

    for (const [seatId, cards] of dealtCards) {
      const isOwner =
        v === seatId &&
        (state.hand?.status === "betting"
          ? !must(state.hand.players.get(seatId)).folded
          : contestants.has(seatId));

      for (const card of cards) {
        const present = cardKeys.has(`${card.rank}${card.suit}`);
        expect(present).toBe(shown.has(seatId) || isOwner);
      }
    }
  }
}

describe("property: view never leaks a hole card it isn't entitled to", () => {
  it("holds at every step of arbitrary hands, for every seat and the table", () => {
    fc.assert(
      fc.property(
        seatsArb,
        fc.string({ minLength: 1, maxLength: 10 }),
        fc.array(actionArb, { minLength: 0, maxLength: 40 }),
        (seats, seed, actions) => {
          let state: EngineState = createInitialState(seats);
          const firstPlayer = must(seats[0]);
          const startEvents = decide(state, {
            type: "startHand",
            seatId: firstPlayer,
            seed,
          });
          if (!Array.isArray(startEvents)) {
            throw new Error("unexpected rejection starting the hand");
          }
          for (const event of startEvents) state = apply(state, event);

          const dealt = startEvents.find((e) => e.type === "HoleCardsDealt");
          if (dealt?.type !== "HoleCardsDealt") {
            throw new Error("expected a deal");
          }
          const dealtCards = new Map<SeatId, readonly [Card, Card]>(
            dealt.deals.map((d) => [d.seatId, d.cards]),
          );

          assertNoLeak(state, dealtCards, seats);

          for (const action of actions) {
            if (state.hand?.status !== "betting") break;
            const hand = state.hand;
            const actor = must(hand.toAct[0]);
            const legal = facingBet(hand, actor)
              ? action === "check"
                ? "call"
                : action
              : action === "call"
                ? "check"
                : action;
            const result = decide(state, { type: legal, seatId: actor });
            if (!Array.isArray(result)) continue;
            for (const event of result) state = apply(state, event);
            assertNoLeak(state, dealtCards, seats);
          }

          for (const command of [
            { type: "reveal", seatId: firstPlayer },
            ...seats.map((seatId) => ({ type: "show", seatId }) as const),
          ] as const) {
            const result = decide(state, command);
            if (!Array.isArray(result)) continue;
            for (const event of result) state = apply(state, event);
            assertNoLeak(state, dealtCards, seats);
          }

          assertNoLeak(state, dealtCards, seats);
        },
      ),
    );
  });
});
