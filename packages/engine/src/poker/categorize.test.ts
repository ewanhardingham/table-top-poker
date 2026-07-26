import { describe, expect, it } from "vitest";
import { categorize } from "./categorize.js";
import type { Card } from "../types.js";

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

describe("categorize", () => {
  it("recognizes a high card hand", () => {
    const result = categorize(cards("2c 5h 9d Jc As"));
    expect(result.category).toBe("high-card");
    expect(result.tiebreak).toEqual([14, 11, 9, 5, 2]);
  });

  it("recognizes one pair", () => {
    const result = categorize(cards("2c 2h 9d Jc As"));
    expect(result.category).toBe("pair");
    expect(result.tiebreak).toEqual([2, 14, 11, 9]);
  });

  it("recognizes two pair", () => {
    const result = categorize(cards("2c 2h 9d 9c As"));
    expect(result.category).toBe("two-pair");
    expect(result.tiebreak).toEqual([9, 2, 14]);
  });

  it("recognizes three of a kind", () => {
    const result = categorize(cards("2c 2h 2d 9c As"));
    expect(result.category).toBe("three-of-a-kind");
    expect(result.tiebreak).toEqual([2, 14, 9]);
  });

  it("recognizes a straight", () => {
    const result = categorize(cards("5c 6h 7d 8c 9s"));
    expect(result.category).toBe("straight");
    expect(result.tiebreak).toEqual([9]);
  });

  it("recognizes the wheel (ace-low straight) as five high", () => {
    const result = categorize(cards("Ac 2h 3d 4c 5s"));
    expect(result.category).toBe("straight");
    expect(result.tiebreak).toEqual([5]);
  });

  it("does not treat A-K-Q-J-10 wraparound (K-Q-J-10-A... low) as a straight", () => {
    // Q,K,A,2,3 is not a straight in either direction.
    const result = categorize(cards("Qc Kh Ad 2c 3s"));
    expect(result.category).toBe("high-card");
  });

  it("recognizes a flush", () => {
    const result = categorize(cards("2c 5c 9c Jc Ac"));
    expect(result.category).toBe("flush");
    expect(result.tiebreak).toEqual([14, 11, 9, 5, 2]);
  });

  it("recognizes a full house", () => {
    const result = categorize(cards("2c 2h 2d 9c 9s"));
    expect(result.category).toBe("full-house");
    expect(result.tiebreak).toEqual([2, 9]);
  });

  it("recognizes four of a kind", () => {
    const result = categorize(cards("2c 2h 2d 2s 9s"));
    expect(result.category).toBe("four-of-a-kind");
    expect(result.tiebreak).toEqual([2, 9]);
  });

  it("recognizes a straight flush", () => {
    const result = categorize(cards("5c 6c 7c 8c 9c"));
    expect(result.category).toBe("straight-flush");
    expect(result.tiebreak).toEqual([9]);
  });

  it("recognizes a royal flush as an ace-high straight flush", () => {
    const result = categorize(cards("10c Jc Qc Kc Ac"));
    expect(result.category).toBe("straight-flush");
    expect(result.tiebreak).toEqual([14]);
  });

  it("picks the best five-card hand out of seven cards", () => {
    const result = categorize(cards("2c 2h 9d Jc As 3h 4d"));
    expect(result.category).toBe("pair");
    expect(result.bestHand).toHaveLength(5);
  });

  it("prefers a flush over a straight when seven cards offer both", () => {
    // Diamonds 4-5-6-9-10 make a flush (not a straight); 6-7-8-9-10 across
    // suits makes a straight. Flush must win.
    const result = categorize(cards("4d 5d 6d 7h 8h 9d 10d"));
    expect(result.category).toBe("flush");
  });

  it("returns the best five cards for a flush, not six", () => {
    const result = categorize(cards("2c 5c 9c Jc Ac 7c 3d"));
    expect(result.category).toBe("flush");
    expect(result.bestHand).toHaveLength(5);
    expect(result.tiebreak).toEqual([14, 11, 9, 7, 5]);
  });

  it("resolves a full house from seven cards using the best trips and best pair", () => {
    // trips of 9s, trips of 2s -> full house should be 9s full of 2s (best trip + best remaining pair-or-trip)
    const result = categorize(cards("9c 9h 9d 2c 2h 2d Kc"));
    expect(result.category).toBe("full-house");
    expect(result.tiebreak).toEqual([9, 2]);
  });
});
