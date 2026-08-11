import { TEACHABLE_GESTURES, type TeachableGesture } from "./coaching.js";

const KEY = "ttp:discovered-gestures";

/**
 * The one thing the coaching hints persist: which gestures this device has
 * already found (Phase 3 spec #138 §11). Per-device, permanent, never
 * re-taught — a returning player is not re-shown a hint weeks later.
 *
 * Takes an injected `Storage` exactly as `storage/seatToken.ts` does, so tests
 * pass a double rather than reaching for a global. This is also the only thing
 * in the coaching path that crosses a seam at all: the selector itself stays
 * module-internal, because every in-gesture hint depends on recognizer state
 * nothing outside the module may see.
 */
export function saveDiscovered(
  storage: Storage,
  discovered: ReadonlySet<TeachableGesture>,
): void {
  // Ordered by the teaching order rather than by insertion, so the stored value
  // is the same for a device that folded before it checked.
  const ordered = TEACHABLE_GESTURES.filter((gesture) =>
    discovered.has(gesture),
  );
  try {
    storage.setItem(KEY, JSON.stringify(ordered));
  } catch {
    // Safari in private browsing throws rather than storing. The write happens
    // in the same handler as a Fold or a Check, and an Action must not be lost
    // over a hint that will simply be offered again next time.
  }
}

/**
 * Reads the discovery set back on mount. Absent and malformed storage both read
 * as "nothing discovered": there is nothing else the set could honestly be, and
 * an extra hint is the cheapest possible way to be wrong.
 */
export function loadDiscovered(
  storage: Storage,
): ReadonlySet<TeachableGesture> {
  const raw = storage.getItem(KEY);
  if (raw === null) return new Set();
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return new Set();
    // An allow-list, so a name written by a later version of this surface — or
    // by hand — never reaches the selector as a gesture it cannot teach.
    return new Set(
      TEACHABLE_GESTURES.filter((gesture) => parsed.includes(gesture)),
    );
  } catch {
    return new Set();
  }
}
