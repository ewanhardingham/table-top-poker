import { describe, expect, it } from "vitest";
import { DOUBLE_TAP_MS } from "./constants.js";
import { confirmsCheck, tapLanded } from "./taps.js";

describe("tapLanded", () => {
  it("opens the window on the first tap", () => {
    expect(tapLanded(null, 1000)).toEqual({
      window: 1000,
      event: { type: "TAPPED" },
    });
  });

  it("composes a Check from a second tap inside the window", () => {
    const first = tapLanded(null, 1000);

    expect(tapLanded(first.window, 1000 + DOUBLE_TAP_MS - 1)).toEqual({
      window: null,
      event: { type: "DOUBLE_TAPPED" },
    });
  });

  it("counts a tap landing exactly on the window's edge", () => {
    const first = tapLanded(null, 1000);

    expect(tapLanded(first.window, 1000 + DOUBLE_TAP_MS).event).toEqual({
      type: "DOUBLE_TAPPED",
    });
  });

  it("does not compose a Check from taps outside the window", () => {
    const first = tapLanded(null, 1000);

    expect(tapLanded(first.window, 1000 + DOUBLE_TAP_MS + 1)).toEqual({
      window: 1000 + DOUBLE_TAP_MS + 1,
      event: { type: "TAPPED" },
    });
  });

  it("closes the window on the Check, so a third tap starts a fresh pair", () => {
    const first = tapLanded(null, 1000);
    const second = tapLanded(first.window, 1100);
    const third = tapLanded(second.window, 1200);

    expect(second.event).toEqual({ type: "DOUBLE_TAPPED" });
    // Without this, a triple-tap would send two Checks 100ms apart.
    expect(third).toEqual({ window: 1200, event: { type: "TAPPED" } });
  });

  it("keeps a slow stream of taps composing nothing", () => {
    let window = tapLanded(null, 0).window;
    for (const now of [400, 800, 1200]) {
      const step = tapLanded(window, now);
      expect(step.event).toEqual({ type: "TAPPED" });
      window = step.window;
    }
  });
});

describe("confirmsCheck", () => {
  it("confirms a Check the player could actually make", () => {
    expect(confirmsCheck({ checkLegal: true, pending: false })).toBe(true);
  });

  it("says nothing when Check is not on offer — off-turn, or facing a bet", () => {
    expect(confirmsCheck({ checkLegal: false, pending: false })).toBe(false);
  });

  it("says nothing while another Action is already in flight", () => {
    expect(confirmsCheck({ checkLegal: true, pending: true })).toBe(false);
  });
});
