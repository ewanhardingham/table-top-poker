import { describe, expect, it } from "vitest";
import { dissolveField, fieldAt, fieldToBytes } from "./burnField.js";

const field = dissolveField(24, 32, 7);

describe("dissolveField", () => {
  it("spans exactly 0 to 1, so the threshold eats the whole card", () => {
    let min = Infinity;
    let max = -Infinity;
    for (const value of field.values) {
      min = Math.min(min, value);
      max = Math.max(max, value);
    }
    expect(min).toBeCloseTo(0, 6);
    expect(max).toBeCloseTo(1, 6);
  });

  it("is the same field every hand, so the burn does not flicker between them", () => {
    expect(Array.from(dissolveField(24, 32, 7).values)).toEqual(
      Array.from(field.values),
    );
  });

  it("gives a different front for a different seed", () => {
    expect(Array.from(dissolveField(24, 32, 8).values)).not.toEqual(
      Array.from(field.values),
    );
  });

  it("climbs: the bottom of the card goes before the top", () => {
    const rowMean = (row: number) => {
      let sum = 0;
      for (let x = 0; x < field.width; x += 1) {
        sum += field.values[row * field.width + x] ?? 0;
      }
      return sum / field.width;
    };
    expect(rowMean(0)).toBeLessThan(rowMean(field.height - 1));
  });

  it("is ragged rather than a straight edge sweeping across", () => {
    const row = Math.floor(field.height / 2);
    const across = Array.from({ length: field.width }, (_unused, x) =>
      fieldAt(field, x / (field.width - 1), row / (field.height - 1)),
    );
    expect(new Set(across).size).toBeGreaterThan(1);
  });
});

describe("fieldAt", () => {
  it("clamps rather than reading off the edge of the card", () => {
    expect(fieldAt(field, -5, -5)).toBe(field.values[0]);
    expect(Number.isFinite(fieldAt(field, 9, 9))).toBe(true);
  });
});

describe("fieldToBytes", () => {
  it("packs the field for the GPU without losing its ends", () => {
    const bytes = fieldToBytes(field);
    expect(bytes).toHaveLength(field.values.length);
    expect(Math.min(...bytes)).toBe(0);
    expect(Math.max(...bytes)).toBe(255);
  });
});
