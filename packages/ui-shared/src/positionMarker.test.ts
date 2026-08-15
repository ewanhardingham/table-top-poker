import type { PlayerView, TableView } from "@table-top-poker/protocol";
import { describe, expect, it } from "vitest";
import { positionMarkerFor } from "./positionMarker.js";

const positions = {
  button: 0,
  smallBlind: 1,
  bigBlind: 2,
  dealtSeatCount: 6,
} as const;

const bettingTable: TableView = {
  phase: "betting",
  ...positions,
  street: "flop",
  board: [],
  toAct: [3],
  seats: [
    { seatId: 0, folded: false },
    { seatId: 1, folded: false },
    { seatId: 2, folded: false },
  ],
};

const bettingPlayer: PlayerView = {
  ...bettingTable,
  yourSeatId: 1,
  yourHoleCards: null,
  legalActions: [],
};

describe("positionMarkerFor", () => {
  it("names each of the three positions", () => {
    expect(positionMarkerFor(0, bettingTable)).toBe("button");
    expect(positionMarkerFor(1, bettingTable)).toBe("small-blind");
    expect(positionMarkerFor(2, bettingTable)).toBe("big-blind");
  });

  it("gives a seat holding no position nothing", () => {
    expect(positionMarkerFor(3, bettingTable)).toBeNull();
  });

  it("reads a player view and a table view the same way", () => {
    // The whole reason this rule left table-client: both devices must answer
    // identically for the same seat.
    for (const seatId of [0, 1, 2, 3]) {
      expect(positionMarkerFor(seatId, bettingPlayer)).toBe(
        positionMarkerFor(seatId, bettingTable),
      );
    }
  });

  it("has nothing to say about a seat with no view at all", () => {
    expect(positionMarkerFor(0, null)).toBeNull();
  });

  it("shows only the button between hands, where the engine reports no blinds", () => {
    const view: TableView = { phase: "no-hand", button: 1 };
    expect(positionMarkerFor(1, view)).toBe("button");
    expect(positionMarkerFor(2, view)).toBeNull();
  });

  describe("heads-up (issue #160, decision 4)", () => {
    // The engine honestly reports smallBlind === button heads-up. Rather than
    // put two markers on one seat, the whole trio reverts to button-only.
    const headsUp = {
      button: 0,
      smallBlind: 0,
      bigBlind: 1,
      dealtSeatCount: 2,
    } as const;

    const cases: readonly (readonly [string, TableView])[] = [
      ["betting", { ...bettingTable, ...headsUp, toAct: [0], seats: [] }],
      [
        "showdown",
        {
          phase: "showdown",
          ...headsUp,
          board: [],
          results: [],
          winners: [0],
        },
      ],
      ["folded-out", { phase: "folded-out", ...headsUp, winner: 0 }],
    ];

    it.each(cases)("marks the button and nothing else (%s)", (_phase, view) => {
      expect(positionMarkerFor(0, view)).toBe("button");
      // Not "small-blind", though the button genuinely posts it heads-up…
      expect(positionMarkerFor(1, view)).toBeNull();
      // …and the other seat gets no BB either, on the phone as on the table
      // (issue #207, decision 2).
    });

    it("still marks the blinds once a third seat is dealt in", () => {
      const threeHanded: TableView = {
        ...bettingTable,
        ...headsUp,
        dealtSeatCount: 3,
      };
      expect(positionMarkerFor(1, threeHanded)).toBe("big-blind");
    });
  });
});
