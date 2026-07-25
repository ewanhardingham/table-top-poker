import type { Card } from "../types.js";
import { must } from "../util.js";
import {
  HIGHEST_RANK_VALUE,
  LOWEST_RANK_VALUE,
  RANK_VALUE,
} from "./rank-values.js";

export type HandCategory =
  | "high-card"
  | "pair"
  | "two-pair"
  | "three-of-a-kind"
  | "straight"
  | "flush"
  | "full-house"
  | "four-of-a-kind"
  | "straight-flush";

export interface Categorized {
  readonly category: HandCategory;
  /**
   * Tiebreak ranks in significance order (highest first), enough to compare
   * any two hands of the same category. Length varies by category.
   */
  readonly tiebreak: readonly number[];
  readonly bestHand: readonly [Card, Card, Card, Card, Card];
}

/** Highest 5-in-a-row rank present, wheel-aware (A-2-3-4-5 plays as five-high); 0 if none. */
function highestStraight(present: readonly boolean[]): number {
  const wheel =
    present[HIGHEST_RANK_VALUE] &&
    present[2] &&
    present[3] &&
    present[4] &&
    present[5];
  for (let high = HIGHEST_RANK_VALUE; high >= LOWEST_RANK_VALUE + 4; high--) {
    if (
      present[high] &&
      present[high - 1] &&
      present[high - 2] &&
      present[high - 3] &&
      present[high - 4]
    ) {
      return high;
    }
  }
  return wheel ? 5 : 0;
}

/** Cards of the given ranks (highest rank first), each appearing once, from `pool`. */
function pickByRank(pool: readonly Card[], ranks: readonly number[]): Card[] {
  const remaining = [...pool];
  const picked: Card[] = [];
  for (const rank of ranks) {
    const index = remaining.findIndex((c) => RANK_VALUE[c.rank] === rank);
    const [card] = remaining.splice(index, 1);
    if (card) picked.push(card);
  }
  return picked;
}

function highCardsExcluding(
  byRank: ReadonlyMap<number, Card[]>,
  exclude: ReadonlySet<number>,
  count: number,
): number[] {
  const ranks: number[] = [];
  for (
    let rank = HIGHEST_RANK_VALUE;
    rank >= LOWEST_RANK_VALUE && ranks.length < count;
    rank--
  ) {
    if (!exclude.has(rank) && byRank.has(rank)) ranks.push(rank);
  }
  return ranks;
}

/**
 * Scores every card of a straight of the given high rank, wheel-aware (ace
 * plays low in a five-high straight).
 */
function straightRanks(high: number): number[] {
  if (high === 5) return [5, 4, 3, 2, HIGHEST_RANK_VALUE];
  return [high, high - 1, high - 2, high - 3, high - 4];
}

/** Best 5-card poker hand out of 5-7 cards: category, tiebreak ranks, and the winning cards. */
export function categorize(cards: readonly Card[]): Categorized {
  const byRank = new Map<number, Card[]>();
  const bySuit = new Map<Card["suit"], Card[]>();
  const present = new Array<boolean>(HIGHEST_RANK_VALUE + 1).fill(false);

  for (const card of cards) {
    const rankValue = RANK_VALUE[card.rank];
    present[rankValue] = true;
    const rankGroup = byRank.get(rankValue) ?? [];
    rankGroup.push(card);
    byRank.set(rankValue, rankGroup);
    const suitGroup = bySuit.get(card.suit) ?? [];
    suitGroup.push(card);
    bySuit.set(card.suit, suitGroup);
  }

  const flushCards = [...bySuit.values()].find((group) => group.length >= 5);

  if (flushCards) {
    const flushPresent = new Array<boolean>(HIGHEST_RANK_VALUE + 1).fill(false);
    for (const card of flushCards) flushPresent[RANK_VALUE[card.rank]] = true;
    const straightFlushHigh = highestStraight(flushPresent);
    if (straightFlushHigh) {
      const ranks = straightRanks(straightFlushHigh);
      return {
        category: "straight-flush",
        tiebreak: [straightFlushHigh],
        bestHand: pickByRank(flushCards, ranks) as [
          Card,
          Card,
          Card,
          Card,
          Card,
        ],
      };
    }
  }

  const ranksByCount = new Map<number, number[]>();
  for (const [rank, group] of byRank) {
    const list = ranksByCount.get(group.length) ?? [];
    list.push(rank);
    ranksByCount.set(group.length, list);
  }
  for (const list of ranksByCount.values()) list.sort((a, b) => b - a);

  const quads = ranksByCount.get(4) ?? [];
  const trips = ranksByCount.get(3) ?? [];
  const pairs = ranksByCount.get(2) ?? [];

  if (quads.length > 0) {
    const quadRank = must(quads[0], "quads group must have a rank");
    const kicker = must(
      highCardsExcluding(byRank, new Set([quadRank]), 1)[0],
      "quads always leave a kicker in a 5+ card hand",
    );
    return {
      category: "four-of-a-kind",
      tiebreak: [quadRank, kicker],
      bestHand: pickByRank(cards, [
        quadRank,
        quadRank,
        quadRank,
        quadRank,
        kicker,
      ]) as [Card, Card, Card, Card, Card],
    };
  }

  if (trips.length > 0) {
    const bestTrip = must(trips[0], "trips group must have a rank");
    const pairRank = trips[1] ?? pairs[0];
    if (pairRank !== undefined) {
      return {
        category: "full-house",
        tiebreak: [bestTrip, pairRank],
        bestHand: pickByRank(cards, [
          bestTrip,
          bestTrip,
          bestTrip,
          pairRank,
          pairRank,
        ]) as [Card, Card, Card, Card, Card],
      };
    }
  }

  if (flushCards) {
    const ranks = [...flushCards]
      .map((c) => RANK_VALUE[c.rank])
      .sort((a, b) => b - a)
      .slice(0, 5);
    return {
      category: "flush",
      tiebreak: ranks,
      bestHand: pickByRank(flushCards, ranks) as [Card, Card, Card, Card, Card],
    };
  }

  const straightHigh = highestStraight(present);
  if (straightHigh) {
    const ranks = straightRanks(straightHigh);
    return {
      category: "straight",
      tiebreak: [straightHigh],
      bestHand: pickByRank(cards, ranks) as [Card, Card, Card, Card, Card],
    };
  }

  if (trips.length > 0) {
    const bestTrip = must(trips[0], "trips group must have a rank");
    const kickers = highCardsExcluding(byRank, new Set([bestTrip]), 2);
    return {
      category: "three-of-a-kind",
      tiebreak: [bestTrip, ...kickers],
      bestHand: pickByRank(cards, [
        bestTrip,
        bestTrip,
        bestTrip,
        ...kickers,
      ]) as [Card, Card, Card, Card, Card],
    };
  }

  if (pairs.length >= 2) {
    const highPair = must(pairs[0], "pairs group must have a rank");
    const lowPair = must(pairs[1], "two-pair requires a second pair");
    const kicker = must(
      highCardsExcluding(byRank, new Set([highPair, lowPair]), 1)[0],
      "two pair always leaves a kicker in a 5+ card hand",
    );
    return {
      category: "two-pair",
      tiebreak: [highPair, lowPair, kicker],
      bestHand: pickByRank(cards, [
        highPair,
        highPair,
        lowPair,
        lowPair,
        kicker,
      ]) as [Card, Card, Card, Card, Card],
    };
  }

  if (pairs.length === 1) {
    const pairRank = must(pairs[0], "pairs group must have a rank");
    const kickers = highCardsExcluding(byRank, new Set([pairRank]), 3);
    return {
      category: "pair",
      tiebreak: [pairRank, ...kickers],
      bestHand: pickByRank(cards, [pairRank, pairRank, ...kickers]) as [
        Card,
        Card,
        Card,
        Card,
        Card,
      ],
    };
  }

  const highs = highCardsExcluding(byRank, new Set(), 5);
  return {
    category: "high-card",
    tiebreak: highs,
    bestHand: pickByRank(cards, highs) as [Card, Card, Card, Card, Card],
  };
}
