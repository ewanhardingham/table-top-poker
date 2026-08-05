export interface SeatPosition {
  /** Percent from the felt's left edge. */
  readonly left: number;
  /** Percent from the felt's top edge. */
  readonly top: number;
}

/**
 * Lays seats out along the two long edges of the felt — 1..k left to right
 * along the bottom, then back right to left along the top. The percentages are
 * tuned for the table device's actual viewport, and are the source of truth
 * for the layout.
 */
export function posFor(seatId: number, seatCount: number): SeatPosition {
  const bottomCount = Math.ceil(seatCount / 2);
  if (seatId < bottomCount) {
    const fraction = bottomCount === 1 ? 0.5 : seatId / (bottomCount - 1);
    return { left: 14 + 72 * fraction, top: 90 };
  }

  const topCount = seatCount - bottomCount;
  const j = seatId - bottomCount;
  const fraction = topCount === 1 ? 0.5 : j / (topCount - 1);
  return { left: 86 - 72 * fraction, top: 10 };
}
