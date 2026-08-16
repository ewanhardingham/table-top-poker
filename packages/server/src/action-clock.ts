const DEFAULT_TIMEOUT_MS = 90_000;

/**
 * Per-room "you have N ms to act" timer, fully decoupled from WebSocket
 * connection state — see Phase 1 spec #130 §7 (folding stays strictly
 * clock-driven). Scheduling and clearing functions are injectable so tests
 * can run this at real-but-tiny durations instead of faking global timers.
 */
type TimerHandle = ReturnType<typeof setTimeout>;

export class ActionClock {
  readonly #timeoutMs: number;
  readonly #setTimeoutFn: (fn: () => void, ms: number) => TimerHandle;
  readonly #clearTimeoutFn: (handle: TimerHandle) => void;
  readonly #timers = new Map<string, TimerHandle>();

  constructor(
    timeoutMs: number = DEFAULT_TIMEOUT_MS,
    setTimeoutFn: (fn: () => void, ms: number) => TimerHandle = setTimeout,
    clearTimeoutFn: (handle: TimerHandle) => void = clearTimeout,
  ) {
    this.#timeoutMs = timeoutMs;
    this.#setTimeoutFn = setTimeoutFn;
    this.#clearTimeoutFn = clearTimeoutFn;
  }

  /** Replaces any timer already running for `key` with a fresh one. */
  schedule(key: string, onTimeout: () => void): void;
  /** Replaces any timer with a fresh timer at a room-specific duration. */
  schedule(key: string, timeoutMs: number, onTimeout: () => void): void;
  schedule(
    key: string,
    timeoutMsOrCallback: number | (() => void),
    maybeCallback?: () => void,
  ): void {
    this.clear(key);
    const timeoutMs =
      typeof timeoutMsOrCallback === "number"
        ? timeoutMsOrCallback
        : this.#timeoutMs;
    const onTimeout =
      typeof timeoutMsOrCallback === "function"
        ? timeoutMsOrCallback
        : maybeCallback;
    if (onTimeout === undefined) {
      throw new TypeError("action clock timeout callback is required");
    }
    this.#timers.set(key, this.#setTimeoutFn(onTimeout, timeoutMs));
  }

  clear(key: string): void {
    const handle = this.#timers.get(key);
    if (handle === undefined) return;
    this.#clearTimeoutFn(handle);
    this.#timers.delete(key);
  }
}
