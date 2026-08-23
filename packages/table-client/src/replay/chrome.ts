/**
 * The replay's own chrome — Scrub, Caption, Back to hands — sizes off this
 * unit rather than the root, so it gives way on a short felt while `Seats`,
 * the Board and every card keep the size they have on the live table.
 */
export const CHROME_UNIT_PROPERTY = "--replay-unit";
export const CHROME_GUTTER_PROPERTY = "--replay-gutter";

export const chromeVariables = {
  [CHROME_UNIT_PROPERTY]:
    "clamp(0.62rem, min(0.3rem + 0.72vh, 0.1rem + 1vw), 1rem)",
  [CHROME_GUTTER_PROPERTY]: "clamp(0.7rem, 1.4vw, 1.8rem)",
} as const;

export const chromeFontSize = `var(${CHROME_UNIT_PROPERTY})`;
export const gutter = `var(${CHROME_GUTTER_PROPERTY})`;

/** A chrome measurement, for the bands the felt is laid out against. */
export function chromeUnits(units: number): string {
  return `${String(units)} * var(${CHROME_UNIT_PROPERTY})`;
}

export function chromeBand(units: number): string {
  return `calc(${chromeUnits(units)})`;
}
