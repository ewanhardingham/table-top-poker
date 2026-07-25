import { describe as vitestDescribe, expect, it } from "vitest";
import { describe } from "./describe.js";

vitestDescribe("describe", () => {
  it("describes a high card hand by its top card", () => {
    expect(describe("high-card", [14, 11, 9, 5, 2])).toBe("Ace high");
  });

  it("describes one pair by its rank", () => {
    expect(describe("pair", [9, 14, 11, 8])).toBe("Pair of nines");
  });

  it("describes two pair by both ranks", () => {
    expect(describe("two-pair", [14, 13, 9])).toBe("Two pair, aces and kings");
  });

  it("describes three of a kind by its rank", () => {
    expect(describe("three-of-a-kind", [7, 14, 9])).toBe(
      "Three of a kind, sevens",
    );
  });

  it("describes a straight by its high card", () => {
    expect(describe("straight", [9])).toBe("Straight, nine high");
  });

  it("describes the wheel as a five-high straight", () => {
    expect(describe("straight", [5])).toBe("Straight, five high");
  });

  it("describes a flush by its top card", () => {
    expect(describe("flush", [14, 11, 9, 5, 2])).toBe("Flush, ace high");
  });

  it("describes a full house as trips full of the pair", () => {
    expect(describe("full-house", [9, 2])).toBe(
      "Full house, nines full of twos",
    );
  });

  it("describes four of a kind by its rank", () => {
    expect(describe("four-of-a-kind", [2, 9])).toBe("Four of a kind, twos");
  });

  it("describes a straight flush by its high card", () => {
    expect(describe("straight-flush", [9])).toBe("Straight flush, nine high");
  });

  it("names a royal flush specially", () => {
    expect(describe("straight-flush", [14])).toBe("Royal flush");
  });
});
