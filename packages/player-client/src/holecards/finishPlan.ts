import type { CardEvent, Presentation } from "./cardState.js";
import type { GestureEnd } from "./gesture.js";
import type { CardActions } from "./ports.js";
import { confirmsCheck, tapLanded, type TapWindow } from "./taps.js";

/**
 * One ordered thing a completed gesture does: either advance the reducer, or
 * leave the module and send a poker Action (§2). The list preserves the
 * sequence the hook must replay, so the two orderings that cost money are a
 * property the plan can be asserted on rather than glue only a real pointer
 * could exercise:
 *
 * - **conceal before Check** — the `TAPPED`/`DOUBLE_TAPPED` dispatch precedes
 *   the `check` send, so the player sees the cards go down, then the
 *   confirmation, with no timer between them (story 31);
 * - **depart before Fold** — `leaving` is applied and `RELEASED` dispatched
 *   before the `fold` send, so the pair is already on its way to the muck when
 *   the Action goes and the departure is the player's own answer, not the
 *   server's (§7).
 */
export type FinishEffect =
  | { readonly kind: "dispatch"; readonly event: CardEvent }
  | { readonly kind: "send"; readonly action: "check" | "fold" };

export interface FinishPlan {
  /** The dispatches and sends, in the exact order the hook must replay them. */
  readonly effects: readonly FinishEffect[];
  /**
   * The tap window after this release. A gesture that ended as anything but a
   * tap closes it (`null`), so tap → peek → tap cannot compose a Check out of
   * two taps the player never meant to pair (§5).
   */
  readonly nextTapWindow: TapWindow;
  /**
   * Whether a landed Check should claim, visibly, that it went (story 31).
   * Rendering only, and only ever set alongside a `check` send — a stale prop
   * can at worst confirm an Action the intent then refuses, never send one.
   */
  readonly confirmCheck: boolean;
  /**
   * Set when this release commits the Fold: the pair leaves with whatever face
   * it had (§7). `null` when nothing departs.
   */
  readonly leaving: { readonly faceUp: boolean } | null;
}

export interface FinishInputs {
  /** The completed gesture, from `endGesture(session, { cancelled })`. */
  readonly end: GestureEnd;
  /**
   * The legality flags, for **arming and rendering only** (§2). `canAct`
   * inside `intent.fold`/`intent.check` stays the single gate on whether an
   * Action is actually sent, so a release these flags wave through can still be
   * refused there and a stale flag can at worst arm a gesture `canAct` denies.
   */
  readonly actions: Pick<CardActions, "foldLegal" | "checkLegal" | "pending">;
  /**
   * The presentation the pair leaves from. Read here rather than off the
   * session because a keyboard reveal committed before the press can land
   * mid-drag, and `Turning` is a point of no return — a pair mid-flip is a pair
   * that is going to be face-up (§7).
   */
  readonly presentation: Presentation;
  /** The tap window going in, `performance.now()`-based (§5). */
  readonly tapWindow: TapWindow;
  /**
   * A monotonic clock (`performance.now()`), so two unrelated taps cannot be
   * paired into an Action by a wall clock stepping backwards mid-hand.
   */
  readonly now: number;
}

/**
 * Decide what a completed gesture does — which reducer events fire, which
 * Actions leave the module, what happens to the tap window — as a pure
 * function of the release and the current view.
 *
 * This is the seam where a finger movement turns into a sent poker Action, and
 * #138's strategy is to push that rule out of the renderer so it can be tested
 * by construction rather than by a simulated pointer (#156). The hook that
 * calls this owns only the imperative replay: dispatching the events, calling
 * the named Action functions in order, and seeding the confirmation timer.
 */
export function planFinish(inputs: FinishInputs): FinishPlan {
  const { end, actions, presentation, tapWindow, now } = inputs;
  const { events, commitsFold } = end;

  // Fold legality is re-sampled here, not only where `eventsForPropChange`
  // watches it, because a release can beat the view that would have disarmed
  // it, and `pending` rides along so a Fold cannot go out on top of an Action
  // already in flight (§6). This is arming, exactly as §2 licenses.
  const commits = commitsFold && actions.foldLegal && !actions.pending;

  const effects: FinishEffect[] = [];
  let nextTapWindow: TapWindow = tapWindow;
  let confirmCheck = false;
  let leaving: { readonly faceUp: boolean } | null = null;

  // A drag that armed a Fold but outlived the turn that made it legal disarms:
  // the release commits nothing, and there is no rejection message because the
  // turn banner already explains it (§6). Emitted before `RELEASED`, matching
  // the reducer's order.
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
    // A tap is only *provisionally* a tap: whether it is one, or the second
    // half of a Check, is `taps` to decide.
    const tap = tapLanded(nextTapWindow, now);
    nextTapWindow = tap.window;
    tapped = true;
    // Dispatched first, so the conceal is on screen before the Check goes.
    effects.push({ kind: "dispatch", event: tap.event });
    if (tap.event.type === "DOUBLE_TAPPED") {
      effects.push({ kind: "send", action: "check" });
      confirmCheck = confirmsCheck(actions);
    }
  }
  // The two taps of a Check must be *consecutive*: any other ending closes the
  // window rather than leaving it open on a technicality of the middle gesture.
  if (!tapped) nextTapWindow = null;

  // Sent after the departure is committed, so the pair is already leaving when
  // the Action goes (§7).
  if (commits) effects.push({ kind: "send", action: "fold" });

  return { effects, nextTapWindow, confirmCheck, leaving };
}
