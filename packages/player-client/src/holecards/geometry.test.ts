import { describe, expect, it } from "vitest";
import {
  BEND_TRAVEL_PX,
  FOLD_DISTANCE_RATIO,
  MIN_FOLD_DISTANCE_PX,
} from "./constants.js";
import {
  bendAxis,
  bendProgress,
  foldFlightDistance,
  foldThreshold,
} from "./geometry.js";

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

describe("foldThreshold", () => {
  it("scales with the viewport, so the swipe is the same proportion of any phone", () => {
    expect(foldThreshold(1000)).toBe(1000 * FOLD_DISTANCE_RATIO);
  });

  it("never falls below the floor on a short viewport", () => {
    // On a small or split-screen window the proportional term would put the
    // threshold inside an ordinary thumb flick, and Fold is the one Action
    // that costs money.
    expect(foldThreshold(400)).toBe(MIN_FOLD_DISTANCE_PX);
    expect(foldThreshold(0)).toBe(MIN_FOLD_DISTANCE_PX);
  });

  it("is a distance, not a coordinate — always positive", () => {
    for (const height of [0, 400, 812, 1400]) {
      expect(foldThreshold(height)).toBeGreaterThan(0);
    }
  });
});

describe("foldFlightDistance", () => {
  it("clears the screen, so the muck is off it rather than just above the cards", () => {
    expect(foldFlightDistance(812)).toBeGreaterThanOrEqual(812);
  });

  it("is always further than the threshold the release crossed", () => {
    // Otherwise a committed pair could travel *back down* as the flight took
    // over from the finger.
    for (const height of [0, 400, 812, 1400]) {
      expect(foldFlightDistance(height)).toBeGreaterThan(foldThreshold(height));
    }
  });
});
