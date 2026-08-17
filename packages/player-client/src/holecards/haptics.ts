export function pulse(durationMs: number): void {
  if (typeof navigator === "undefined") return;
  const vibrate = Reflect.get(navigator, "vibrate") as unknown;
  if (typeof vibrate !== "function") return;
  try {
    Reflect.apply(vibrate, navigator, [durationMs]);
  } catch {
    // best-effort: a browser may refuse without a user gesture, or at all
  }
}
