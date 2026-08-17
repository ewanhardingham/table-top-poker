export interface SeatPosition {
  readonly left: number;
  readonly top: number;
}

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
