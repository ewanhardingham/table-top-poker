import type { RevealedResult } from "@table-top-poker/protocol";
import { describe, expect, it } from "vitest";
import { ordinal, rankShowdownHands } from "./showdownRanking.js";

function result(seatId: number, rank: number): RevealedResult {
  return {
    seatId,
    holeCards: [
      { rank: "A", suit: "spades" },
      { rank: "K", suit: "hearts" },
    ],
    rank,
    bestHand: [
      { rank: "A", suit: "spades" },
      { rank: "K", suit: "hearts" },
      { rank: "Q", suit: "clubs" },
      { rank: "J", suit: "diamonds" },
      { rank: "10", suit: "spades" },
    ],
    description: `hand ${String(rank)}`,
  };
}

describe("rankShowdownHands", () => {
  it("orders the shown hands best first", () => {
    const ranked = rankShowdownHands([
      result(0, 10),
      result(1, 30),
      result(2, 20),
    ]);

    expect(ranked.map((hand) => hand.result.seatId)).toEqual([1, 2, 0]);
    expect(ranked.map((hand) => hand.place)).toEqual([1, 2, 3]);
  });

  it("gives tied hands one shared place, and the next hand the next place", () => {
    const ranked = rankShowdownHands([
      result(0, 20),
      result(1, 20),
      result(2, 10),
    ]);

    expect(ranked.map((hand) => hand.place)).toEqual([1, 1, 2]);
  });

  it("ranks only the hands it was given", () => {
    expect(rankShowdownHands([])).toEqual([]);
    expect(rankShowdownHands([result(3, 5)]).map((hand) => hand.place)).toEqual(
      [1],
    );
  });
});

describe("ordinal", () => {
  it("labels the places a table reads", () => {
    expect([1, 2, 3, 4, 8].map(ordinal)).toEqual([
      "1st",
      "2nd",
      "3rd",
      "4th",
      "8th",
    ]);
  });
});
