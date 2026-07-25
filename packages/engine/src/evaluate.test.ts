import { describe, expect, it } from "vitest";
import { evaluate } from "./evaluate.js";
import type { Card } from "./types.js";

function cards(spec: string): Card[] {
  const suitMap = {
    s: "spades",
    h: "hearts",
    d: "diamonds",
    c: "clubs",
  } as const;
  return spec.split(" ").map((token) => {
    const suitChar = token.at(-1) as keyof typeof suitMap;
    const rank = token.slice(0, -1) as Card["rank"];
    return { rank, suit: suitMap[suitChar] };
  });
}

describe("evaluate", () => {
  it("returns a rank, the winning five cards, and a description for seven cards", () => {
    const result = evaluate(cards("2c 2h 9d Jc As 3h 4d"));
    expect(result.description).toBe("Pair of twos");
    expect(result.bestHand).toHaveLength(5);
    expect(typeof result.rank).toBe("number");
  });

  it("ranks a stronger hand above a weaker one", () => {
    const flush = evaluate(cards("2c 5c 9c Jc Ac 3h 4d"));
    const pair = evaluate(cards("2c 2h 9d Jc As 3h 4d"));
    expect(flush.rank).toBeGreaterThan(pair.rank);
  });

  it("gives equal rank to two different hands of the same strength (a split)", () => {
    const boardPlaysA = evaluate(cards("Ac Kd Qh Jc 10s 2h 3d"));
    const boardPlaysB = evaluate(cards("Ac Kd Qh Jc 10s 4h 5d"));
    expect(boardPlaysA.rank).toBe(boardPlaysB.rank);
    expect(boardPlaysA.description).toBe(boardPlaysB.description);
  });
});
