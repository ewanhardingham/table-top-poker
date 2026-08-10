// The production clock/scheduler pair shared by the Web Audio engine and the
// table's beat queue, so both drive off one real-timer implementation instead
// of each repeating `Date.now()`/`setTimeout` at its own call site. Tests
// inject their own hand-cranked clock in its place.
export const realClock = {
  /** Current epoch ms. */
  now: (): number => Date.now(),
  /** Run `fn` after `delayMs`; fire-and-forget. */
  schedule: (fn: () => void, delayMs: number): void => {
    setTimeout(fn, delayMs);
  },
};
