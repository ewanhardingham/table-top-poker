import type { Card, HandEvent, SeatId } from "@table-top-poker/engine";
import { describe, expect, it } from "vitest";
import { summarise, type HandContext } from "./summary.js";

const context: HandContext = {
  handOrdinal: 3,
  startedAt: "2026-08-13T19:04:00.000Z",
};

function card(rank: Card["rank"], suit: Card["suit"]): Card {
  return { rank, suit };
}

const FLOP: Card[] = [
  card("2", "clubs"),
  card("7", "hearts"),
  card("K", "spades"),
];
const TURN: Card[] = [card("9", "diamonds")];
const RIVER: Card[] = [card("A", "clubs")];

/** The three events every hand opens with, for a given button and field. */
function opening(button: SeatId, seats: readonly SeatId[]): HandEvent[] {
  return [
    { type: "HandStarted", seed: "seed", button },
    {
      type: "HoleCardsDealt",
      deals: seats.map((seatId) => ({
        seatId,
        cards: [card("3", "clubs"), card("4", "clubs")] as [Card, Card],
      })),
    },
    { type: "StreetStarted", street: "preflop", actor: seats[0] ?? 0 },
  ];
}

function fold(seatId: SeatId): HandEvent {
  return { type: "ActionTaken", seatId, action: "fold" };
}

function check(seatId: SeatId): HandEvent {
  return { type: "ActionTaken", seatId, action: "check" };
}

function raise(seatId: SeatId): HandEvent {
  return { type: "ActionTaken", seatId, action: "raise" };
}

function call(seatId: SeatId): HandEvent {
  return { type: "ActionTaken", seatId, action: "call" };
}

/** The board deal plus the street's opening event, as the engine emits them. */
function street(
  name: "flop" | "turn" | "river",
  cards: Card[],
  actor: SeatId,
): HandEvent[] {
  return [
    {
      type: "StreetClosed",
      street: name === "flop" ? "preflop" : name === "turn" ? "flop" : "turn",
    },
    { type: "BoardDealt", street: name, cards },
    { type: "StreetStarted", street: name, actor },
  ];
}

function foldedOut(winner: SeatId): HandEvent[] {
  return [{ type: "HandFoldedOut", winner }, { type: "HandComplete" }];
}

function showdown(seats: readonly SeatId[], winners: SeatId[]): HandEvent[] {
  return [
    { type: "StreetClosed", street: "river" },
    {
      type: "ShowdownReached",
      results: seats.map((seatId) => ({
        seatId,
        rank: winners.includes(seatId) ? 2 : 1,
        bestHand: [...FLOP, ...TURN, ...RIVER] as [
          Card,
          Card,
          Card,
          Card,
          Card,
        ],
        description: `seat ${String(seatId)}'s hand`,
      })),
      winners,
    },
    { type: "HandComplete" },
  ];
}

describe("summarise", () => {
  it("carries the context's ordinal and start time through untouched", () => {
    const summary = summarise(
      [...opening(2, [0, 1, 2]), fold(0), fold(1), ...foldedOut(2)],
      context,
    );
    expect(summary.handOrdinal).toBe(3);
    expect(summary.startedAt).toBe("2026-08-13T19:04:00.000Z");
  });

  it("reads the button and the dealt-in field off the opening events", () => {
    const summary = summarise(
      [...opening(2, [0, 1, 2]), fold(0), fold(1), ...foldedOut(2)],
      context,
    );
    expect(summary.button).toBe(2);
    expect(summary.seatsDealtIn).toEqual([0, 1, 2]);
  });

  it("counts everyone who never folded as a survivor", () => {
    const summary = summarise(
      [
        ...opening(0, [0, 1, 2, 3]),
        fold(1),
        call(2),
        call(3),
        check(0),
        ...street("flop", FLOP, 2),
        check(2),
        check(3),
        fold(0),
        ...street("turn", TURN, 2),
        check(2),
        fold(3),
        ...foldedOut(2),
      ],
      context,
    );
    expect(summary.seatsDealtIn).toEqual([0, 1, 2, 3]);
    expect(summary.survivors).toEqual([2]);
  });

  it("collects the public board in deal order and reports the street reached", () => {
    const summary = summarise(
      [
        ...opening(0, [0, 1]),
        call(0),
        check(1),
        ...street("flop", FLOP, 1),
        check(1),
        check(0),
        ...street("turn", TURN, 1),
        check(1),
        fold(0),
        ...foldedOut(1),
      ],
      context,
    );
    expect(summary.board).toEqual([...FLOP, ...TURN]);
    expect(summary.streetReached).toBe("turn");
  });

  it("leaves the board empty on a hand that died preflop", () => {
    const summary = summarise(
      [...opening(1, [0, 1]), fold(0), ...foldedOut(1)],
      context,
    );
    expect(summary.board).toEqual([]);
    expect(summary.streetReached).toBe("preflop");
  });

  describe("betting shape", () => {
    it("calls an unraised preflop fold-out a walk", () => {
      const summary = summarise(
        [...opening(1, [0, 1, 2]), fold(0), fold(1), ...foldedOut(2)],
        context,
      );
      expect(summary.bettingShape).toEqual({ kind: "walk" });
    });

    it("calls a single raise that ends it preflop a preflop raise", () => {
      const summary = summarise(
        [...opening(1, [0, 1, 2]), raise(0), fold(1), fold(2), ...foldedOut(0)],
        context,
      );
      expect(summary.bettingShape).toEqual({ kind: "preflop-raise" });
    });

    it("calls a hand with no raise at all checked down", () => {
      const summary = summarise(
        [
          ...opening(0, [0, 1]),
          call(0),
          check(1),
          ...street("flop", FLOP, 1),
          check(1),
          check(0),
          ...street("turn", TURN, 1),
          check(1),
          check(0),
          ...street("river", RIVER, 1),
          check(1),
          check(0),
          ...showdown([0, 1], [1]),
        ],
        context,
      );
      expect(summary.bettingShape).toEqual({ kind: "checked-down" });
    });

    it("calls one raise past preflop a one-raise hand", () => {
      const summary = summarise(
        [
          ...opening(0, [0, 1]),
          call(0),
          check(1),
          ...street("flop", FLOP, 1),
          raise(1),
          call(0),
          ...street("turn", TURN, 1),
          check(1),
          fold(0),
          ...foldedOut(1),
        ],
        context,
      );
      expect(summary.bettingShape).toEqual({ kind: "one-raise" });
    });

    it("counts the raises in a raise war, wherever they fell", () => {
      const summary = summarise(
        [
          ...opening(0, [0, 1]),
          raise(0),
          raise(1),
          raise(0),
          call(1),
          ...street("flop", FLOP, 1),
          raise(1),
          fold(0),
          ...foldedOut(1),
        ],
        context,
      );
      expect(summary.bettingShape).toEqual({ kind: "raise-war", raises: 4 });
    });

    it("prefers the raise count over the preflop shorthand once it is a war", () => {
      const summary = summarise(
        [
          ...opening(0, [0, 1, 2]),
          raise(0),
          raise(1),
          fold(2),
          fold(0),
          ...foldedOut(1),
        ],
        context,
      );
      expect(summary.bettingShape).toEqual({ kind: "raise-war", raises: 2 });
    });
  });

  describe("outcome", () => {
    it("names the last player standing on a fold-out", () => {
      const summary = summarise(
        [...opening(1, [0, 1, 2]), fold(0), fold(1), ...foldedOut(2)],
        context,
      );
      expect(summary.outcome).toEqual({ kind: "folded-out", winner: 2 });
    });

    it("carries every showdown reveal and the winners", () => {
      const summary = summarise(
        [
          ...opening(0, [0, 1]),
          call(0),
          check(1),
          ...street("flop", FLOP, 1),
          check(1),
          check(0),
          ...street("turn", TURN, 1),
          check(1),
          check(0),
          ...street("river", RIVER, 1),
          check(1),
          check(0),
          ...showdown([0, 1], [1]),
        ],
        context,
      );
      expect(summary.outcome).toEqual({
        kind: "showdown",
        winners: [1],
        reveals: [
          {
            seatId: 0,
            bestHand: [...FLOP, ...TURN, ...RIVER],
            description: "seat 0's hand",
          },
          {
            seatId: 1,
            bestHand: [...FLOP, ...TURN, ...RIVER],
            description: "seat 1's hand",
          },
        ],
      });
      expect(summary.survivors).toEqual([0, 1]);
    });

    it("carries every winner of a split pot", () => {
      const summary = summarise(
        [
          ...opening(0, [0, 1]),
          call(0),
          check(1),
          ...street("flop", FLOP, 1),
          check(1),
          check(0),
          ...street("turn", TURN, 1),
          check(1),
          check(0),
          ...street("river", RIVER, 1),
          check(1),
          check(0),
          ...showdown([0, 1], [0, 1]),
        ],
        context,
      );
      expect(summary.outcome).toMatchObject({
        kind: "showdown",
        winners: [0, 1],
      });
    });
  });

  describe("incomplete and invalid recordings", () => {
    it("refuses a hand that never completed", () => {
      expect(() =>
        summarise([...opening(1, [0, 1, 2]), fold(0)], context),
      ).toThrow(/HandComplete/);
    });

    it("refuses a stream that never started a hand", () => {
      expect(() => summarise([{ type: "HandComplete" }], context)).toThrow(
        /HandStarted/,
      );
    });

    it("refuses a completed hand with no outcome event", () => {
      expect(() =>
        summarise(
          [...opening(1, [0, 1]), fold(0), { type: "HandComplete" }],
          context,
        ),
      ).toThrow(/outcome/);
    });

    it("refuses an empty stream", () => {
      expect(() => summarise([], context)).toThrow();
    });
  });

  it("derives nothing from ambient state — the same events summarise identically twice", () => {
    const events: HandEvent[] = [
      ...opening(1, [0, 1, 2]),
      fold(0),
      fold(1),
      ...foldedOut(2),
    ];
    expect(summarise(events, context)).toEqual(summarise(events, context));
  });
});
