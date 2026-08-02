/**
 * A threshold pulse, where the platform allows one (Phase 3 spec #138 §16).
 *
 * **Never semantic feedback.** Browser vibration is Blink-only: there is no
 * Vibration API in Safari at all, so the iPhone path has to work with none of
 * this. Everything the pulse says is already said by the cards moving and by
 * the permanent in-gesture text (§11), and this only adds weight to the moment
 * for the players whose browser can.
 *
 * Reached through `Reflect` rather than `navigator.vibrate?.()` because the DOM
 * lib types the method as always present, which is exactly the assumption the
 * Safari path breaks.
 */
export function pulse(durationMs: number): void {
  if (typeof navigator === "undefined") return;
  const vibrate = Reflect.get(navigator, "vibrate") as unknown;
  if (typeof vibrate !== "function") return;
  try {
    Reflect.apply(vibrate, navigator, [durationMs]);
  } catch {
    // Best-effort: a browser may refuse without a user gesture, or at all.
  }
}
