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
 * the flame is brightest late — see `docs/design/burn-pile.md`.
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

/** Tuned by eye — see `docs/design/burn-pile.md`. */
export const FLAME = {
  bloomSizeEm: 4.2,
  bloomPeakOpacity: 0.85,
  cardBrightness: 1.9,
  tongueHeightEm: 2.2,
  curlDegrees: -18,
} as const;

const TONGUE_OFFSETS_EM = [-0.9, 0, 0.9];
const TONGUE_STAGGER_S = 0.04;

export function flameSpan(timing: BurnTiming): number {
  return timing.ignite.duration + timing.fade.duration;
}

/** Fractions of the flame's span, placing its brightest frame on `peakAt`. */
export function flameKeyframes(
  timing: BurnTiming,
): readonly [number, number, number] {
  const span = flameSpan(timing);
  return span === 0 ? [0, 0, 1] : [0, timing.ignite.duration / span, 1];
}

export interface TongueFlame {
  readonly key: string;
  readonly offsetEm: number;
  readonly delay: number;
  readonly duration: number;
}

export function tongueFlames(timing: BurnTiming): readonly TongueFlame[] {
  return TONGUE_OFFSETS_EM.map((offsetEm, index) => {
    const delay = timing.ignite.delay + index * TONGUE_STAGGER_S;
    return {
      key: `tongue-${String(index)}`,
      offsetEm,
      delay,
      duration: Math.max(timing.total - delay, 0),
    };
  });
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
