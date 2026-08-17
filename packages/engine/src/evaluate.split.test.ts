import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { evaluate, winnersOf } from "./evaluate.js";
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

describe("evaluate: split and tie cases", () => {
  it("splits when the board itself plays the best five (kickers dead)", () => {
    const board = "Ac Kd Qh Jc 10s";
    const seatA = evaluate(cards(`${board} 2h 3d`));
    const seatB = evaluate(cards(`${board} 4h 5d`));
    expect(seatA.rank).toBe(seatB.rank);
  });

  it("does not split when kickers differ within the same category and rank", () => {
    const seatA = evaluate(cards("Ac Ah Kd Kh Qc 2s 3d"));
    const seatB = evaluate(cards("As Ad Ks Kc Jc 2s 3d"));
    expect(seatA.rank).toBeGreaterThan(seatB.rank);
  });

  it("splits on the same straight made from different suits", () => {
    const seatA = evaluate(cards("5c 6d 7h 8s 9c Ah 2d"));
    const seatB = evaluate(cards("5d 6c 7s 8h 9d Ac 2h"));
    expect(seatA.rank).toBe(seatB.rank);
    expect(seatA.description).toBe("Straight, nine high");
  });

  it("the wheel beats a made pair of kings", () => {
    const wheel = evaluate(cards("Ac 2h 3d 4c 5s Kh Kd"));
    const kings = evaluate(cards("Kc Kh 9d Jc 8s 2h 3d"));
    expect(wheel.rank).toBeGreaterThan(kings.rank);
    expect(wheel.description).toBe("Straight, five high");
  });

  it("returns exactly five cards for a hand with six flush-suited cards available", () => {
    const result = evaluate(cards("5c 8c 9c Kc Ac 7c 3d"));
    expect(result.bestHand).toHaveLength(5);
    expect(result.description).toBe("Flush, ace high");
  });

  it("three-way splits a royal flush on the board", () => {
    const board = "10s Js Qs Ks As";
    const seatA = evaluate(cards(`${board} 2h 3d`));
    const seatB = evaluate(cards(`${board} 4h 5d`));
    const seatC = evaluate(cards(`${board} 6h 7d`));
    expect(seatA.rank).toBe(seatB.rank);
    expect(seatB.rank).toBe(seatC.rank);
    expect(seatA.description).toBe("Royal flush");
  });
});

describe("property: winnersOf", () => {
  const resultArb = fc.array(
    fc.record({ seatId: fc.integer({ min: 0, max: 7 }), rank: fc.integer() }),
    { minLength: 1, maxLength: 8 },
  );

  it("returns exactly the seats tied for the best rank, and is never empty", () => {
    fc.assert(
      fc.property(resultArb, (results) => {
        const winners = winnersOf(results);
        const bestRank = Math.max(...results.map((result) => result.rank));

        expect(winners.length).toBeGreaterThan(0);
        expect(new Set(winners)).toEqual(
          new Set(
            results
              .filter((result) => result.rank === bestRank)
              .map((result) => result.seatId),
          ),
        );
      }),
    );
  });
});
