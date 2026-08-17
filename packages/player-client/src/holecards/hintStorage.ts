import { TEACHABLE_GESTURES, type TeachableGesture } from "./coaching.js";

const KEY = "ttp:discovered-gestures";

export function saveDiscovered(
  storage: Storage,
  discovered: ReadonlySet<TeachableGesture>,
): void {
  const ordered = TEACHABLE_GESTURES.filter((gesture) =>
    discovered.has(gesture),
  );
  try {
    storage.setItem(KEY, JSON.stringify(ordered));
  } catch {
    // storage may throw (e.g. Safari private browsing); the hint is re-offered
  }
}

export function loadDiscovered(
  storage: Storage,
): ReadonlySet<TeachableGesture> {
  const raw = storage.getItem(KEY);
  if (raw === null) return new Set();
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return new Set();
    return new Set(
      TEACHABLE_GESTURES.filter((gesture) => parsed.includes(gesture)),
    );
  } catch {
    return new Set();
  }
}
