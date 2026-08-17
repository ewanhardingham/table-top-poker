import { describe, expect, it } from "vitest";
import { classify, type ClassifyInput } from "./classify.js";

function input(overrides: Partial<ClassifyInput> = {}): ClassifyInput {
  return {
    fromBendZone: false,
    alreadyRevealed: false,
    dx: 0,
    dy: 0,
    foldLegal: true,
    ...overrides,
  };
}

describe("classify", () => {
  it("reads a press on the bend zone as a bend while face-down, whatever the direction", () => {
    const directions: readonly (readonly [number, number])[] = [
      [-40, 0],
      [0, -40],
      [40, 0],
      [0, 40],
    ];
    for (const [dx, dy] of directions) {
      expect(classify(input({ fromBendZone: true, dx, dy }))).toBe("Bending");
    }
  });

  it("does not bend from the bend zone once the pair is already revealed", () => {
    expect(
      classify(
        input({ fromBendZone: true, alreadyRevealed: true, dx: 0, dy: -40 }),
      ),
    ).toBe("FoldDragging");
  });

  it("keeps bending from the bend zone even on a decisive upward swipe", () => {
    expect(classify(input({ fromBendZone: true, dx: 0, dy: -300 }))).toBe(
      "Bending",
    );
  });

  it("reads an upward-dominant drag as a fold", () => {
    expect(classify(input({ dx: 0, dy: -40 }))).toBe("FoldDragging");
    expect(classify(input({ dx: 10, dy: -40 }))).toBe("FoldDragging");
  });

  it("requires upward travel past the 1.05 ratio, not merely more than sideways", () => {
    expect(classify(input({ dx: -40, dy: -42 }))).toBe("Ignored");
    expect(classify(input({ dx: -40, dy: -42.5 }))).toBe("FoldDragging");
  });

  it("ignores a drag that is upward but barely more so than sideways", () => {
    expect(classify(input({ dx: 40, dy: -41 }))).toBe("Ignored");
  });

  it("ignores sideways and downward drags", () => {
    expect(classify(input({ dx: -60, dy: 0 }))).toBe("Ignored");
    expect(classify(input({ dx: 60, dy: 0 }))).toBe("Ignored");
    expect(classify(input({ dx: 0, dy: 60 }))).toBe("Ignored");
    expect(classify(input({ dx: 10, dy: 60 }))).toBe("Ignored");
  });

  it("falls through to Ignored when Fold is not legal", () => {
    expect(classify(input({ dx: 0, dy: -300, foldLegal: false }))).toBe(
      "Ignored",
    );
  });

  it("still bends from the bend zone when Fold is not legal", () => {
    expect(
      classify(input({ fromBendZone: true, dy: -40, foldLegal: false })),
    ).toBe("Bending");
  });
});
