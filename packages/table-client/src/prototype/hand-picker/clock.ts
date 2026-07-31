/**
 * PROTOTYPE — throwaway, wayfinder ticket #87.
 *
 * The three "does the row show when a Hand started" alternatives, as pure
 * formatters so the row markup stays identical across modes — only this
 * fragment differs.
 *
 * `formatRelative` takes `now` as an argument rather than reading `Date.now()`
 * itself so a component can re-render it on a tick: the open question this
 * ticket raises is exactly that relative text goes stale while the picker
 * stays open, so the prototype has to make that staleness visible rather
 * than compute the label once and forget it.
 */
export type ClockMode = "none" | "absolute" | "relative";

export const clockModes: readonly ClockMode[] = ["none", "absolute", "relative"];

export const clockModeNames: Record<ClockMode, string> = {
  none: "No clock — order and Hand # only",
  absolute: "Absolute — local start time",
  relative: "Relative — “N ago”, live-ticking",
};

export function formatAbsolute(startedAt: string): string {
  return new Date(startedAt).toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });
}

export function formatRelative(startedAt: string, now: number): string {
  const seconds = Math.max(0, Math.round((now - new Date(startedAt).getTime()) / 1000));
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${String(minutes)}m ago`;
  const hours = Math.floor(minutes / 60);
  const remainderMinutes = minutes % 60;
  return remainderMinutes === 0
    ? `${String(hours)}h ago`
    : `${String(hours)}h ${String(remainderMinutes)}m ago`;
}
