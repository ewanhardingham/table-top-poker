import { describe, expect, it } from "vitest";
import {
  ASH_HALF_W,
  ASH_STAGE,
  BOARD_GAP_EM,
  BURN_BUDGET_S,
  CUE_PEAK_S,
  HEAP_COLUMNS,
  HEAP_MAX_EM,
  ashFootprint,
  burnTiming,
  cueHeat,
  heapIndex,
  heapSurfaceY,
  justBurntIndex,
  phaseProgress,
  raiseHeap,
  streetDealDelay,
} from "./burnPile.js";

describe("burnTiming", () => {
  it("finishes eating the card as the cue runs out", () => {
    const { consume } = burnTiming();
    expect(consume.delay + consume.duration).toBeCloseTo(BURN_BUDGET_S, 5);
  });

  it("peaks with the cue's swell rather than on frame one", () => {
    expect(burnTiming().peakAt).toBe(CUE_PEAK_S);
    expect(CUE_PEAK_S).toBeLessThan(BURN_BUDGET_S);
  });

  it("catches before the card has landed, so it reads as one event", () => {
    const { travel, ignite } = burnTiming();
    expect(ignite.delay).toBeGreaterThan(0);
    expect(ignite.delay).toBeLessThan(travel.duration);
  });

  it("builds from the catch to the peak", () => {
    const { ignite, peakAt } = burnTiming();
    expect(ignite.delay + ignite.duration).toBeCloseTo(peakAt, 5);
  });

  it("starts taking the card apart only once it has caught", () => {
    const { ignite, consume } = burnTiming();
    expect(consume.delay).toBeGreaterThan(ignite.delay);
  });

  it("lets the ash go on falling after the card has gone", () => {
    const timing = burnTiming();
    expect(timing.total).toBeGreaterThan(BURN_BUDGET_S);
    expect(timing.settle.delay + timing.settle.duration).toBeCloseTo(
      timing.total,
      5,
    );
  });

  it("puts the ash straight on the felt under reduced motion", () => {
    const timing = burnTiming(true);
    expect(timing.total).toBe(0);
    for (const phase of [
      timing.travel,
      timing.ignite,
      timing.consume,
      timing.settle,
    ]) {
      expect(phase).toEqual({ delay: 0, duration: 0 });
    }
  });
});

describe("streetDealDelay", () => {
  it("holds the street for the card's destruction, not the ash's fall", () => {
    const timing = burnTiming();
    expect(streetDealDelay(false)).toBe(BURN_BUDGET_S);
    expect(streetDealDelay(false)).toBeLessThan(timing.total);
  });

  it("deals straight away when there is no burn to wait for", () => {
    expect(streetDealDelay(true)).toBe(0);
  });
});

describe("cueHeat", () => {
  it("is brightest exactly on the cue's peak", () => {
    const timing = burnTiming();
    const peak = cueHeat(timing, timing.peakAt);
    expect(peak).toBeCloseTo(1, 5);
    expect(cueHeat(timing, timing.peakAt - 0.1)).toBeLessThan(peak);
    expect(cueHeat(timing, timing.peakAt + 0.1)).toBeLessThan(peak);
  });

  it("is out by the time the cue is", () => {
    expect(cueHeat(burnTiming(), BURN_BUDGET_S)).toBe(0);
    expect(cueHeat(burnTiming(), 0)).toBe(0);
  });

  it("stays dark under reduced motion", () => {
    expect(cueHeat(burnTiming(true), 0.3)).toBe(0);
  });
});

describe("phaseProgress", () => {
  it("runs 0 to 1 across the phase and clamps outside it", () => {
    const phase = { delay: 0.2, duration: 0.4 };
    expect(phaseProgress(phase, 0.1)).toBe(0);
    expect(phaseProgress(phase, 0.4)).toBeCloseTo(0.5, 5);
    expect(phaseProgress(phase, 5)).toBe(1);
  });

  it("is already done for a phase with no duration", () => {
    expect(phaseProgress({ delay: 0, duration: 0 }, 0)).toBe(1);
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

describe("ashFootprint", () => {
  const { restX } = ASH_STAGE;

  it("leaves ash landing under the card where it fell", () => {
    expect(ashFootprint(restX)).toBeCloseTo(restX, 5);
  });

  it("keeps even the furthest drifter inside the card's footprint", () => {
    for (const far of [-50, -6, 6, 50]) {
      expect(Math.abs(ashFootprint(restX + far) - restX)).toBeLessThan(
        ASH_HALF_W,
      );
    }
  });

  it("never lets ash reach the community row", () => {
    const boardEdge = restX + ASH_STAGE.cardWidth / 2 + BOARD_GAP_EM;
    for (const far of [6, 100, 10_000]) {
      expect(ashFootprint(restX + far)).toBeLessThan(boardEdge);
    }
    // The gap is the clearance that matters, and most of it must survive.
    expect(boardEdge - ashFootprint(restX + 10_000)).toBeGreaterThan(
      BOARD_GAP_EM * 0.9,
    );
  });

  it("squashes without flattening, so the edges stay ragged", () => {
    expect(ashFootprint(restX + 2)).toBeGreaterThan(ashFootprint(restX + 1));
  });

  it("is symmetric about the card", () => {
    expect(ashFootprint(restX + 1.5) - restX).toBeCloseTo(
      restX - ashFootprint(restX - 1.5),
      5,
    );
  });
});

describe("the heap", () => {
  const { restX } = ASH_STAGE;

  it("puts every landing in a column, however far it drifted", () => {
    for (const x of [-100, restX, 100]) {
      const index = heapIndex(x);
      expect(index).toBeGreaterThanOrEqual(0);
      expect(index).toBeLessThan(HEAP_COLUMNS);
    }
  });

  it("starts at the felt and rises as ash lands", () => {
    const heap = new Float32Array(HEAP_COLUMNS);
    const felt = heapSurfaceY(heap, restX);
    raiseHeap(heap, restX);
    expect(heapSurfaceY(heap, restX)).toBeLessThan(felt);
  });

  it("mounds where the ash actually falls, not across the whole pile", () => {
    const heap = new Float32Array(HEAP_COLUMNS);
    for (let i = 0; i < 200; i += 1) raiseHeap(heap, restX);
    expect(heapSurfaceY(heap, restX)).toBeLessThan(
      heapSurfaceY(heap, restX + 1.4),
    );
  });

  it("stops rising at the cap, so a long hand cannot build a wall", () => {
    const heap = new Float32Array(HEAP_COLUMNS);
    for (let i = 0; i < 10_000; i += 1) raiseHeap(heap, restX);
    expect(heap[heapIndex(restX)]).toBeCloseTo(HEAP_MAX_EM, 5);
  });
});
