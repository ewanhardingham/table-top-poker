import { describe, expect, it } from "vitest";
import type { Beat } from "./beats.js";
import { MAX_TICKS, positionAtRatio, ticksFor } from "./track.js";

function beats(count: number, streetStarts: readonly number[] = []): Beat[] {
  return Array.from({ length: count }, (_unused, index) => ({
    position: index + 1,
    street: "preflop" as const,
    weight: 100,
    isStreetStart: streetStarts.includes(index + 1),
  }));
}

describe("positionAtRatio", () => {
  it("lands on the nearest ordinal", () => {
    expect(positionAtRatio(0, 10)).toBe(0);
    expect(positionAtRatio(0.5, 10)).toBe(5);
    expect(positionAtRatio(0.44, 10)).toBe(4);
    expect(positionAtRatio(1, 10)).toBe(10);
  });

  it("clamps a finger that has left the track", () => {
    expect(positionAtRatio(-0.3, 10)).toBe(0);
    expect(positionAtRatio(1.8, 10)).toBe(10);
  });

  it("stays at 0 for a hand with no positions to seek", () => {
    expect(positionAtRatio(0.5, 0)).toBe(0);
  });
});

describe("ticksFor", () => {
  it("draws one tick per ordinal for an ordinary hand", () => {
    const drawn = ticksFor(beats(33, [3, 7]));

    expect(drawn.map((tick) => tick.position)).toEqual(
      beats(33).map((beat) => beat.position),
    );
  });

  it("collapses the ticks of an unusually long hand", () => {
    const drawn = ticksFor(beats(MAX_TICKS * 4, [5]));

    expect(drawn.length).toBeLessThanOrEqual(MAX_TICKS);
  });

  it("keeps every street boundary when it collapses — chapters are the contract", () => {
    const boundaries = [5, 400, 900];
    const drawn = ticksFor(beats(MAX_TICKS * 4, boundaries));

    for (const boundary of boundaries) {
      expect(drawn.map((tick) => tick.position)).toContain(boundary);
    }
    expect(
      drawn.filter((tick) => tick.isStreetStart).map((tick) => tick.position),
    ).toEqual(boundaries);
  });
});
