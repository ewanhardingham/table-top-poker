import { must } from "../util.js";
import type { HandCategory } from "./categorize.js";

const SINGULAR: Record<number, string> = {
  2: "two",
  3: "three",
  4: "four",
  5: "five",
  6: "six",
  7: "seven",
  8: "eight",
  9: "nine",
  10: "ten",
  11: "jack",
  12: "queen",
  13: "king",
  14: "ace",
};

const PLURAL: Record<number, string> = {
  2: "twos",
  3: "threes",
  4: "fours",
  5: "fives",
  6: "sixes",
  7: "sevens",
  8: "eights",
  9: "nines",
  10: "tens",
  11: "jacks",
  12: "queens",
  13: "kings",
  14: "aces",
};

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function singular(rank: number): string {
  return must(SINGULAR[rank], `no singular name for rank ${String(rank)}`);
}

function plural(rank: number): string {
  return must(PLURAL[rank], `no plural name for rank ${String(rank)}`);
}

/** A human-readable name for a category + tiebreak, e.g. "Full house, nines full of twos". */
export function describe(
  category: HandCategory,
  tiebreak: readonly number[],
): string {
  const first = must(
    tiebreak[0],
    "every category has at least one tiebreak rank",
  );
  switch (category) {
    case "high-card":
      return `${capitalize(singular(first))} high`;
    case "pair":
      return `Pair of ${plural(first)}`;
    case "two-pair": {
      const second = must(tiebreak[1], "two pair has a second rank");
      return `Two pair, ${plural(first)} and ${plural(second)}`;
    }
    case "three-of-a-kind":
      return `Three of a kind, ${plural(first)}`;
    case "straight":
      return `Straight, ${singular(first)} high`;
    case "flush":
      return `Flush, ${singular(first)} high`;
    case "full-house": {
      const second = must(tiebreak[1], "full house has a pair rank");
      return `Full house, ${plural(first)} full of ${plural(second)}`;
    }
    case "four-of-a-kind":
      return `Four of a kind, ${plural(first)}`;
    case "straight-flush":
      return first === 14
        ? "Royal flush"
        : `Straight flush, ${singular(first)} high`;
  }
}
