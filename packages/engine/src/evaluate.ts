import { categorize } from "./poker/categorize.js";
import { describe } from "./poker/describe.js";
import { scoreOf } from "./poker/score.js";
import type { Card, HandRank } from "./types.js";

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
