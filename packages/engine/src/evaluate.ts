import { categorize } from "./poker/categorize.js";
import { describe } from "./poker/describe.js";
import { scoreOf } from "./poker/score.js";
import type { Card, HandRank, SeatId } from "./types.js";

export interface HandEvaluation {
  readonly rank: HandRank;
  readonly bestHand: readonly [Card, Card, Card, Card, Card];
  readonly description: string;
}

export function evaluate(cards: readonly Card[]): HandEvaluation {
  const { category, tiebreak, bestHand } = categorize(cards);
  return {
    rank: scoreOf(category, tiebreak),
    bestHand,
    description: describe(category, tiebreak),
  };
}

export function winnersOf(
  results: readonly { seatId: SeatId; rank: HandRank }[],
): SeatId[] {
  const bestRank = Math.max(...results.map((result) => result.rank));
  return results
    .filter((result) => result.rank === bestRank)
    .map((result) => result.seatId);
}
