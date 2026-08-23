import type { DispatchStep } from "./rooms.js";

function isRunOut(steps: readonly DispatchStep[]): boolean {
  return (
    steps.some((step) => step.event.type === "ShowdownReached") &&
    steps.some((step) => step.event.type === "BoardDealt")
  );
}

function opensAStreet(step: DispatchStep): boolean {
  return (
    step.event.type === "CardBurned" || step.event.type === "ShowdownReached"
  );
}

/**
 * Splits a run-out’s Events into the beats a table watches arrive — see
 * Run-out pacing in `docs/design/server.md`. Anything else stays one beat.
 */
export function runOutBeats(
  steps: readonly DispatchStep[],
): readonly (readonly DispatchStep[])[] {
  if (!isRunOut(steps)) return [steps];

  const beats: DispatchStep[][] = [];
  let current: DispatchStep[] = [];
  for (const step of steps) {
    if (opensAStreet(step) && current.length > 0) {
      beats.push(current);
      current = [];
    }
    current.push(step);
  }
  beats.push(current);
  return beats;
}
