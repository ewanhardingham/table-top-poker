import type { RevealedResult } from "@table-top-poker/protocol";

export interface RankedShowdownHand {
  readonly result: RevealedResult;
  readonly place: number;
}

const teens = new Set([11, 12, 13]);
const suffixes: Record<number, string> = { 1: "st", 2: "nd", 3: "rd" };

export function ordinal(place: number): string {
  const suffix = teens.has(place % 100) ? "th" : (suffixes[place % 10] ?? "th");
  return `${String(place)}${suffix}`;
}

export function rankShowdownHands(
  results: readonly RevealedResult[],
): readonly RankedShowdownHand[] {
  let place = 0;
  let previous: number | null = null;
  return [...results]
    .sort((a, b) => b.rank - a.rank)
    .map((result) => {
      if (result.rank !== previous) place += 1;
      previous = result.rank;
      return { result, place };
    });
}
