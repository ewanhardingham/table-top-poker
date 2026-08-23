export const BURN_BUDGET_S = 0.7;

export interface BurnPhase {
  readonly delay: number;
  readonly duration: number;
}

export interface BurnTiming {
  readonly travel: BurnPhase;
  readonly ignite: BurnPhase;
  readonly fade: BurnPhase;
  readonly peakAt: number;
  readonly total: number;
}

const PEAK_AT_S = 0.5;
const TRAVEL_S = 0.26;
const CATCH_AT_S = 0.13;

const STILL: BurnPhase = { delay: 0, duration: 0 };

/**
 * The burn cue is a swell, not a hit: it peaks 400–600ms into its 700ms — so
 * the flame catches after the card lands and is brightest late (#265).
 */
export function burnTiming(reducedMotion = false): BurnTiming {
  if (reducedMotion) {
    return {
      travel: STILL,
      ignite: STILL,
      fade: STILL,
      peakAt: 0,
      total: 0,
    };
  }

  return {
    travel: { delay: 0, duration: TRAVEL_S },
    ignite: { delay: CATCH_AT_S, duration: PEAK_AT_S - CATCH_AT_S },
    fade: { delay: PEAK_AT_S, duration: BURN_BUDGET_S - PEAK_AT_S },
    peakAt: PEAK_AT_S,
    total: BURN_BUDGET_S,
  };
}

export function streetDealDelay(reducedMotion = false): number {
  return reducedMotion ? 0 : BURN_BUDGET_S;
}

/** Offsets are pixels, as `motion`'s `x`/`y` take them. */
export interface PileCard {
  readonly key: string;
  readonly index: number;
  readonly x: number;
  readonly y: number;
  readonly rotate: number;
  readonly arriving: boolean;
}

export function pileCards(
  burnedCount: number,
  alreadyPiled: number,
): readonly PileCard[] {
  return Array.from({ length: burnedCount }, (_unused, index) => ({
    key: `burn-${String(index)}`,
    index,
    x: index * 1.5,
    y: index * -1.2,
    rotate: ((index * 7) % 13) - 6,
    arriving: index >= alreadyPiled,
  }));
}
