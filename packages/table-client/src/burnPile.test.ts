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
  burnTransition,
  clearSpan,
  cueHeat,
  emptySpan,
  heapIndex,
  heapSurfaceY,
  markSpan,
  phaseProgress,
  raiseHeap,
  settleFlake,
  spanRange,
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

describe("burnTransition", () => {
  it("sets a card alight when the count steps by one", () => {
    expect(burnTransition(1, 0)).toBe("burn");
    expect(burnTransition(3, 2)).toBe("burn");
  });

  it("does nothing when the count has not moved", () => {
    expect(burnTransition(2, 2)).toBe("none");
  });

  // Burning once for a jump of three would leave one card's worth of ash for
  // three burns; clearing the felt for a step backwards would show none at all.
  it("rebuilds the pile when several burns arrive at once", () => {
    expect(burnTransition(3, 0)).toBe("resettle");
  });

  it("rebuilds the pile when a seek moves the count backwards", () => {
    expect(burnTransition(1, 3)).toBe("resettle");
  });

  it("rebuilds the pile when a fresh hand clears it", () => {
    expect(burnTransition(0, 3)).toBe("resettle");
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

  /**
   * `tanh` is the identity at `restX`, so a test that only lands ash in the
   * middle of the pile passes whether or not the squash is applied twice.
   * These land it where the two disagree.
   */
  describe("away from the middle, where the squash bites", () => {
    const drifted = restX + ASH_HALF_W * 1.2;

    it("settles a flake where the surface was read for it", () => {
      const heap = new Float32Array(HEAP_COLUMNS);
      expect(settleFlake(heap, drifted)).toBeCloseTo(ashFootprint(drifted), 5);
    });

    it("mounds the column a drifting flake actually lands in", () => {
      const heap = new Float32Array(HEAP_COLUMNS);
      const felt = heapSurfaceY(heap, drifted);
      for (let i = 0; i < 200; i += 1) settleFlake(heap, drifted);
      expect(heapSurfaceY(heap, drifted)).toBeLessThan(felt);
    });

    // Squashing on the way in raises a column nothing reads back, and leaves
    // the flake's own column flat: ash off-centre never mounds.
    it("is not idempotent, so a caller must not footprint first", () => {
      expect(heapIndex(ashFootprint(drifted))).not.toBe(heapIndex(drifted));
    });
  });
});

describe("the dirty span", () => {
  it("has nothing to upload until something is touched", () => {
    expect(spanRange(emptySpan())).toBeNull();
  });

  /**
   * The bug this exists to prevent: hundreds of points land in one frame, and
   * `three` drains an attribute's ranges once per render. Keeping only the last
   * would leave the rest zero-initialised — sized 0, alpha 0 — and invisible,
   * with the draw range still counting them.
   */
  it("covers every point touched between two uploads", () => {
    const span = emptySpan();
    for (const index of [7, 3, 11, 4]) markSpan(span, index);
    expect(spanRange(span)).toEqual({ start: 3, count: 9 });
  });

  it("covers a run marked in one go", () => {
    const span = emptySpan();
    markSpan(span, 0, 120);
    expect(spanRange(span)).toEqual({ start: 0, count: 120 });
  });

  it("ignores an empty run", () => {
    const span = emptySpan();
    markSpan(span, 4, 0);
    expect(spanRange(span)).toBeNull();
  });

  it("starts over once uploaded", () => {
    const span = emptySpan();
    markSpan(span, 5);
    clearSpan(span);
    expect(spanRange(span)).toBeNull();
  });
});
