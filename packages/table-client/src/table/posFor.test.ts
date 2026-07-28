import { describe, expect, it } from "vitest";
import { posFor } from "./posFor.js";

describe("posFor", () => {
  it("spreads an 8-seat table across the bottom edge first, then the top", () => {
    expect(posFor(0, 8)).toEqual({ left: 14, top: 90 });
    expect(posFor(3, 8)).toEqual({ left: 86, top: 90 });
    expect(posFor(4, 8)).toEqual({ left: 86, top: 10 });
    expect(posFor(7, 8)).toEqual({ left: 14, top: 10 });
  });

  it("centres a single seat on each edge instead of dividing by zero", () => {
    expect(posFor(0, 1)).toEqual({ left: 50, top: 90 });
    expect(posFor(0, 2)).toEqual({ left: 50, top: 90 });
    expect(posFor(1, 2)).toEqual({ left: 50, top: 10 });
  });

  it("splits an odd seat count with the extra seat on the bottom edge", () => {
    expect(posFor(0, 3)).toEqual({ left: 14, top: 90 });
    expect(posFor(1, 3)).toEqual({ left: 86, top: 90 });
    expect(posFor(2, 3)).toEqual({ left: 50, top: 10 });
  });
});
