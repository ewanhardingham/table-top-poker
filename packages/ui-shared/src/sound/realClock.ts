export const realClock = {
  now: (): number => Date.now(),
  schedule: (fn: () => void, delayMs: number): void => {
    setTimeout(fn, delayMs);
  },
};
