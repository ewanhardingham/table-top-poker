import type { HandRank } from "../types.js";
import type { HandCategory } from "./categorize.js";
import { HIGHEST_RANK_VALUE } from "./rank-values.js";

const CATEGORY_ORDER: readonly HandCategory[] = [
  "high-card",
  "pair",
  "two-pair",
  "three-of-a-kind",
  "straight",
  "flush",
  "full-house",
  "four-of-a-kind",
  "straight-flush",
];

const TIEBREAK_SLOTS = 5;
const RADIX = HIGHEST_RANK_VALUE + 1;

export function scoreOf(
  category: HandCategory,
  tiebreak: readonly number[],
): HandRank {
  let score = CATEGORY_ORDER.indexOf(category);
  for (let slot = 0; slot < TIEBREAK_SLOTS; slot++) {
    score = score * RADIX + (tiebreak[slot] ?? 0);
  }
  return score;
}
