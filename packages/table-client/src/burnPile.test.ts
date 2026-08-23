import { describe, expect, it } from "vitest";
import {
  BURN_BUDGET_S,
  flameKeyframes,
  justBurntIndex,
  burnTiming,
  flameSpan,
  pileCards,
  streetDealDelay,
  tongueFlames,
} from "./burnPile.js";

describe("burnTiming", () => {
  it("fits the whole burn inside the budget the street deal is gated on", () => {
    const timing = burnTiming();
    expect(timing.total).toBe(BURN_BUDGET_S);
    for (const phase of [timing.travel, timing.ignite, timing.fade]) {
      expect(phase.delay + phase.duration).toBeLessThanOrEqual(BURN_BUDGET_S);
    }
  });

  it("peaks late, with the cue's swell rather than on frame one", () => {
    const { peakAt } = burnTiming();
    expect(peakAt).toBeGreaterThanOrEqual(0.4);
    expect(peakAt).toBeLessThanOrEqual(0.6);
  });

  it("lets the card land before the flame takes hold", () => {
    const { travel, ignite } = burnTiming();
    expect(ignite.delay).toBeGreaterThan(0);
    expect(ignite.delay).toBeGreaterThanOrEqual(travel.duration / 2);
  });

  it("builds to the peak and dies back after it", () => {
    const { ignite, fade, peakAt } = burnTiming();
    expect(ignite.delay + ignite.duration).toBeCloseTo(peakAt, 5);
    expect(fade.delay).toBeCloseTo(peakAt, 5);
    expect(fade.delay + fade.duration).toBe(BURN_BUDGET_S);
  });

  it("puts the card straight onto the pile under reduced motion", () => {
    const timing = burnTiming(true);
    expect(timing.total).toBe(0);
    for (const phase of [timing.travel, timing.ignite, timing.fade]) {
      expect(phase).toEqual({ delay: 0, duration: 0 });
    }
  });
});

describe("streetDealDelay", () => {
  it("holds the board's deal-in until the burn has finished", () => {
    expect(streetDealDelay(false)).toBe(BURN_BUDGET_S);
  });

  it("deals straight away when there is no burn to wait for", () => {
    expect(streetDealDelay(true)).toBe(0);
  });
});

describe("pileCards", () => {
  it("shows nothing before the first burn", () => {
    expect(pileCards(0, 0)).toEqual([]);
  });

  it("shows one face-down card per burn", () => {
    expect(pileCards(3, 3)).toHaveLength(3);
  });

  it("animates only the card that has just been burnt", () => {
    expect(pileCards(3, 2).map((card) => card.arriving)).toEqual([
      false,
      false,
      true,
    ]);
  });

  it("scatters the pile deterministically so it reads as a stack", () => {
    const [first, second] = pileCards(2, 2);
    expect(pileCards(2, 2)).toEqual([first, second]);
    expect(second?.y).not.toBe(first?.y);
    expect(second?.rotate).not.toBe(first?.rotate);
  });

  it("deals in the first burn of a fresh hand after the pile has cleared", () => {
    expect(pileCards(1, 0).map((card) => card.arriving)).toEqual([true]);
  });

  it("settles a pile rendered whole, as after a reconnect mid-hand", () => {
    expect(pileCards(2, 5).every((card) => !card.arriving)).toBe(true);
  });
});

describe("justBurntIndex", () => {
  it("names the card to set alight when the count grows", () => {
    expect(justBurntIndex(1, 0)).toBe(0);
    expect(justBurntIndex(3, 2)).toBe(2);
  });

  it("lights nothing when the count has not moved", () => {
    expect(justBurntIndex(2, 2)).toBeNull();
  });

  it("lights nothing when a fresh hand clears the pile", () => {
    expect(justBurntIndex(0, 3)).toBeNull();
  });

  it("lights only the last of several burns arriving at once", () => {
    expect(justBurntIndex(3, 0)).toBe(2);
  });
});

describe("flameSpan", () => {
  it("runs from the catch to the end of the budget", () => {
    const timing = burnTiming();
    expect(flameSpan(timing)).toBeCloseTo(
      BURN_BUDGET_S - timing.ignite.delay,
      5,
    );
  });

  it("has nothing to play under reduced motion", () => {
    expect(flameSpan(burnTiming(true))).toBe(0);
  });
});

describe("flameKeyframes", () => {
  it("puts the flame's brightest frame on the cue's peak", () => {
    const timing = burnTiming();
    const [start, peak, end] = flameKeyframes(timing);
    expect(start).toBe(0);
    expect(end).toBe(1);
    expect(timing.ignite.delay + peak * flameSpan(timing)).toBeCloseTo(
      timing.peakAt,
      5,
    );
  });
});

describe("tongueFlames", () => {
  it("gives each tongue its own place and a stagger behind the last", () => {
    const tongues = tongueFlames(burnTiming());
    expect(tongues.length).toBeGreaterThan(1);
    const offsets = tongues.map((tongue) => tongue.offsetEm);
    expect(new Set(offsets).size).toBe(offsets.length);
    for (const [index, tongue] of tongues.entries()) {
      const previous = tongues[index - 1];
      if (previous === undefined) continue;
      expect(tongue.delay).toBeGreaterThan(previous.delay);
    }
  });

  it("holds every tongue inside the burn budget, all dying together", () => {
    const timing = burnTiming();
    for (const { delay, duration } of tongueFlames(timing)) {
      expect(delay).toBeGreaterThanOrEqual(timing.ignite.delay);
      expect(delay + duration).toBeCloseTo(BURN_BUDGET_S, 5);
    }
  });
});
