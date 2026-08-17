import type { CardEvent, Presentation } from "./cardState.js";
import type { GestureEnd } from "./gesture.js";
import type { CardActions } from "./ports.js";
import { confirmsCheck, tapLanded, type TapWindow } from "./taps.js";

export type FinishEffect =
  | { readonly kind: "dispatch"; readonly event: CardEvent }
  | { readonly kind: "send"; readonly action: "check" | "fold" };

export interface FinishPlan {
  readonly effects: readonly FinishEffect[];
  readonly nextTapWindow: TapWindow;
  readonly confirmCheck: boolean;
  readonly leaving: { readonly faceUp: boolean } | null;
}

export interface FinishInputs {
  readonly end: GestureEnd;
  readonly actions: Pick<CardActions, "foldLegal" | "checkLegal" | "pending">;
  readonly presentation: Presentation;
  readonly tapWindow: TapWindow;
  readonly now: number;
}

export function planFinish(inputs: FinishInputs): FinishPlan {
  const { end, actions, presentation, tapWindow, now } = inputs;
  const { events, commitsFold } = end;

  const commits = commitsFold && actions.foldLegal && !actions.pending;

  const effects: FinishEffect[] = [];
  let nextTapWindow: TapWindow = tapWindow;
  let confirmCheck = false;
  let leaving: { readonly faceUp: boolean } | null = null;

  if (commitsFold && !commits) {
    effects.push({ kind: "dispatch", event: { type: "FOLD_DISARMED" } });
  }

  if (commits) {
    leaving = {
      faceUp: presentation === "Revealed" || presentation === "Turning",
    };
  }

  let tapped = false;
  for (const event of events) {
    if (event.type !== "TAPPED") {
      effects.push({ kind: "dispatch", event });
      continue;
    }
    const tap = tapLanded(nextTapWindow, now);
    nextTapWindow = tap.window;
    tapped = true;
    effects.push({ kind: "dispatch", event: tap.event });
    if (tap.event.type === "DOUBLE_TAPPED") {
      effects.push({ kind: "send", action: "check" });
      confirmCheck = confirmsCheck(actions);
    }
  }
  if (!tapped) nextTapWindow = null;

  if (commits) effects.push({ kind: "send", action: "fold" });

  return { effects, nextTapWindow, confirmCheck, leaving };
}
