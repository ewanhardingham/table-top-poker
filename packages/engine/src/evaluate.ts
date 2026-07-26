import { categorize } from "./poker/categorize.js";
import { describe } from "./poker/describe.js";
import { scoreOf } from "./poker/score.js";
import type { Card, HandRank, SeatId } from "./types.js";

export interface HandEvaluation {
  readonly rank: HandRank;
  readonly bestHand: readonly [Card, Card, Card, Card, Card];
  readonly description: string;
}

/**
 * Evaluates 5-7 cards (a hold'em showdown always passes 7: two hole cards
 * plus a five-card board) and returns a comparable rank, the winning five
 * cards, and a human-readable description of the made hand.
 */
export function evaluate(cards: readonly Card[]): HandEvaluation {
  const { category, tiebreak, bestHand } = categorize(cards);
  return {
    rank: scoreOf(category, tiebreak),
    bestHand,
    description: describe(category, tiebreak),
  };
}

/**
 * Every seat tied for the best rank — split-aware, since Phase 1 tracks no
 * chip value and "split" just means multiple winners reported.
 */
export function winnersOf(
  results: readonly { seatId: SeatId; rank: HandRank }[],
): SeatId[] {
  const bestRank = Math.max(...results.map((result) => result.rank));
  return results
    .filter((result) => result.rank === bestRank)
    .map((result) => result.seatId);
}
