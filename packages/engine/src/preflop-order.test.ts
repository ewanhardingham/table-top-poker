import { describe, expect, it } from "vitest";
import { initialToAct, rotateFromButton } from "./table.js";
import type { SeatId } from "./types.js";

const BUTTON: SeatId = 1;

const cases: { n: number; expected: SeatId[]; note: string }[] = [
  { n: 2, expected: [1, 2], note: "BTN/SB, BB" },
  { n: 3, expected: [1, 2, 3], note: "BTN, SB, BB" },
  { n: 4, expected: [4, 1, 2, 3], note: "UTG, BTN, SB, BB" },
  { n: 5, expected: [4, 5, 1, 2, 3], note: "UTG, UTG+1, BTN, SB, BB" },
  { n: 6, expected: [4, 5, 6, 1, 2, 3], note: "UTG..UTG+2, BTN, SB, BB" },
  { n: 7, expected: [4, 5, 6, 7, 1, 2, 3], note: "UTG..LJ, BTN, SB, BB" },
  { n: 8, expected: [4, 5, 6, 7, 8, 1, 2, 3], note: "UTG..HJ, BTN, SB, BB" },
];

describe("initialToAct: preflop order", () => {
  for (const { n, expected, note } of cases) {
    it(`opens left of the blinds and ends on the BB ${String(n)}-handed (${note})`, () => {
      const seats: SeatId[] = Array.from({ length: n }, (_, i) => i + 1);
      const ring = rotateFromButton(seats, BUTTON);

      expect(initialToAct(ring, ring, BUTTON, "preflop")).toEqual(expected);
    });
  }
});

describe("initialToAct: postflop order", () => {
  for (const { n } of cases) {
    it(`runs small blind to button ${String(n)}-handed`, () => {
      const seats: SeatId[] = Array.from({ length: n }, (_, i) => i + 1);
      const ring = rotateFromButton(seats, BUTTON);

      expect(initialToAct(ring, ring, BUTTON, "flop")).toEqual(ring);
    });
  }
});

describe("initialToAct: folded seats", () => {
  it("drops folded seats from the preflop lap, keeping the rotation", () => {
    const ring = rotateFromButton([1, 2, 3, 4, 5], BUTTON);
    expect(initialToAct(ring, [1, 3, 5], BUTTON, "preflop")).toEqual([5, 1, 3]);
  });

  it("keeps heads-up order off the ring, not the live seats", () => {
    const ring = rotateFromButton([1, 2, 3], BUTTON);
    expect(initialToAct(ring, [1, 3], BUTTON, "preflop")).toEqual([1, 3]);
  });
});
