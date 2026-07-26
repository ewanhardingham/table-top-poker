import { describe, expect, it } from "vitest";
import { scoreOf } from "./score.js";

describe("scoreOf", () => {
  it("ranks a higher category above any lower category regardless of tiebreak", () => {
    const weakStraightFlush = scoreOf("straight-flush", [5]);
    const strongQuads = scoreOf("four-of-a-kind", [14, 13]);
    expect(weakStraightFlush).toBeGreaterThan(strongQuads);
  });

  it("breaks ties within a category by the tiebreak ranks, most significant first", () => {
    const acesUp = scoreOf("two-pair", [14, 13, 12]);
    const kingsUp = scoreOf("two-pair", [13, 12, 11]);
    expect(acesUp).toBeGreaterThan(kingsUp);
  });

  it("is equal for identical category and tiebreak, which is how splits are detected", () => {
    const a = scoreOf("flush", [14, 11, 9, 5, 2]);
    const b = scoreOf("flush", [14, 11, 9, 5, 2]);
    expect(a).toBe(b);
  });

  it("resolves a kicker further down the tiebreak when earlier ranks match", () => {
    const higherKicker = scoreOf("pair", [10, 14, 9, 8]);
    const lowerKicker = scoreOf("pair", [10, 14, 9, 7]);
    expect(higherKicker).toBeGreaterThan(lowerKicker);
  });
});
