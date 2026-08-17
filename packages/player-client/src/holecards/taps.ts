import type { CardEvent } from "./cardState.js";
import { DOUBLE_TAP_MS } from "./constants.js";
import type { CardActions } from "./ports.js";

export type TapWindow = number | null;

export interface TapStep {
  readonly window: TapWindow;
  readonly event: Extract<CardEvent, { type: "TAPPED" | "DOUBLE_TAPPED" }>;
}

export function tapLanded(window: TapWindow, now: number): TapStep {
  if (window !== null && now - window <= DOUBLE_TAP_MS) {
    return { window: null, event: { type: "DOUBLE_TAPPED" } };
  }
  return { window: now, event: { type: "TAPPED" } };
}

export function confirmsCheck(
  actions: Pick<CardActions, "checkLegal" | "pending">,
): boolean {
  return actions.checkLegal && !actions.pending;
}
