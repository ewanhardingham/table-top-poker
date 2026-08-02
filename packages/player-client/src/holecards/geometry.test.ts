import { describe, expect, it } from "vitest";
import { BEND_TRAVEL_PX } from "./constants.js";
import { bendAxis, bendProgress } from "./geometry.js";

describe("bendProgress", () => {
  it("is zero before the finger has moved", () => {
    expect(bendProgress(0, 0)).toBe(0);
  });

  it("counts leftward and upward travel at equal weight", () => {
    expect(bendProgress(-40, 0)).toBeCloseTo(40 / BEND_TRAVEL_PX);
    expect(bendProgress(0, -40)).toBeCloseTo(40 / BEND_TRAVEL_PX);
    expect(bendProgress(-40, -40)).toBeCloseTo(80 / BEND_TRAVEL_PX);
  });

  it("drives a pure leftward drag at the full rate, so the finger stays clear of the face", () => {
    expect(bendProgress(-BEND_TRAVEL_PX, 0)).toBe(1);
  });

  it("ignores rightward and downward travel rather than subtracting it", () => {
    expect(bendProgress(80, 80)).toBe(0);
    expect(bendProgress(-40, 200)).toBeCloseTo(40 / BEND_TRAVEL_PX);
  });

  it("clamps at 1 however far the finger keeps going", () => {
    expect(bendProgress(-4000, -4000)).toBe(1);
  });
});

describe("bendAxis", () => {
  it("reads a leftward-dominant bend as leftward", () => {
    expect(bendAxis(-40, -10)).toBe("left");
  });

  it("reads an upward-dominant bend as upward", () => {
    expect(bendAxis(-10, -40)).toBe("up");
  });

  it("reads an equal bend as upward, since the finger is still over the face", () => {
    expect(bendAxis(-40, -40)).toBe("up");
  });
});
