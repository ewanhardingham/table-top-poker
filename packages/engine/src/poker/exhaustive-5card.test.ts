import { describe, expect, it } from "vitest";
import phe from "phe";
import { categorize } from "./categorize.js";
import { scoreOf } from "./score.js";
import type { Card, Rank, Suit } from "../types.js";
import { must } from "../util.js";

const RANK_TO_PHE: Record<Rank, string> = {
  "2": "2",
  "3": "3",
  "4": "4",
  "5": "5",
  "6": "6",
  "7": "7",
  "8": "8",
  "9": "9",
  "10": "T",
  J: "J",
  Q: "Q",
  K: "K",
  A: "A",
};

const SUIT_TO_PHE: Record<Suit, string> = {
  clubs: "c",
  diamonds: "d",
  hearts: "h",
  spades: "s",
};

const SUITS: readonly Suit[] = ["clubs", "diamonds", "hearts", "spades"];
const RANKS: readonly Rank[] = [
  "2",
  "3",
  "4",
  "5",
  "6",
  "7",
  "8",
  "9",
  "10",
  "J",
  "Q",
  "K",
  "A",
];

const deck: Card[] = [];
const pheCode: number[] = [];
for (const suit of SUITS) {
  for (const rank of RANKS) {
    deck.push({ rank, suit });
    pheCode.push(phe.cardCode(RANK_TO_PHE[rank], SUIT_TO_PHE[suit]));
  }
}

const CANONICAL_5CARD_FREQUENCIES: Record<string, number> = {
  "straight-flush": 40,
  "four-of-a-kind": 624,
  "full-house": 3744,
  flush: 5108,
  straight: 10200,
  "three-of-a-kind": 54912,
  "two-pair": 123552,
  pair: 1098240,
  "high-card": 1302540,
};

describe("exhaustive 5-card enumeration vs phe", () => {
  it("agrees with phe on every one of the 2,598,960 five-card hands, and matches the canonical category frequencies", () => {
    const pheToOurScore = new Map<number, number>();
    const ourScoreToPhe = new Map<number, number>();
    const categoryFrequencies: Record<string, number> = {};

    const hand = new Array<Card>(5);
    const codes = new Array<number>(5);
    const n = deck.length;
    let total = 0;

    for (let a = 0; a < n; a++) {
      hand[0] = must(deck[a], "index in range");
      codes[0] = must(pheCode[a], "index in range");
      for (let b = a + 1; b < n; b++) {
        hand[1] = must(deck[b], "index in range");
        codes[1] = must(pheCode[b], "index in range");
        for (let c = b + 1; c < n; c++) {
          hand[2] = must(deck[c], "index in range");
          codes[2] = must(pheCode[c], "index in range");
          for (let d = c + 1; d < n; d++) {
            hand[3] = must(deck[d], "index in range");
            codes[3] = must(pheCode[d], "index in range");
            for (let e = d + 1; e < n; e++) {
              hand[4] = must(deck[e], "index in range");
              codes[4] = must(pheCode[e], "index in range");

              total++;
              const { category, tiebreak } = categorize(hand);
              const ourScore = scoreOf(category, tiebreak);
              const pheValue = phe.evaluateCardCodes(codes);

              categoryFrequencies[category] =
                (categoryFrequencies[category] ?? 0) + 1;

              const mappedOurScore = pheToOurScore.get(pheValue);
              if (mappedOurScore === undefined) {
                pheToOurScore.set(pheValue, ourScore);
              } else if (mappedOurScore !== ourScore) {
                throw new Error(
                  `phe value ${String(pheValue)} maps to two different scores: ${String(mappedOurScore)} and ${String(ourScore)}`,
                );
              }

              const mappedPheValue = ourScoreToPhe.get(ourScore);
              if (mappedPheValue === undefined) {
                ourScoreToPhe.set(ourScore, pheValue);
              } else if (mappedPheValue !== pheValue) {
                throw new Error(
                  `our score ${String(ourScore)} maps to two different phe values: ${String(mappedPheValue)} and ${String(pheValue)}`,
                );
              }
            }
          }
        }
      }
    }

    expect(total).toBe(2_598_960);
    expect(categoryFrequencies).toEqual(CANONICAL_5CARD_FREQUENCIES);
    expect(pheToOurScore.size).toBe(7462);
    expect(ourScoreToPhe.size).toBe(7462);

    const orderedByPhe = [...pheToOurScore.entries()].sort(
      (x, y) => x[0] - y[0],
    );
    for (let i = 1; i < orderedByPhe.length; i++) {
      const previous = must(orderedByPhe[i - 1], "index in range");
      const current = must(orderedByPhe[i], "index in range");
      expect(current[1]).toBeLessThan(previous[1]);
    }
  }, 120_000);
});
