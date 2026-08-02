import type { CardEvent } from "./cardState.js";
import { DOUBLE_TAP_MS } from "./constants.js";
import type { CardActions } from "./ports.js";

/**
 * The double-tap window as a value (Phase 3 spec #138 §5, story 27).
 *
 * **No timer arbitration.** A tap is answered the moment it lands — the Check
 * goes on the second tap's arrival rather than on a timer deciding, 280ms
 * later, that no second tap is coming. That is what makes the gesture a reflex
 * instead of a delay, and it is why the conceal a first tap performs is visible
 * before the Check it may turn out to be half of.
 *
 * The accepted trade-off (§5): a Check cannot be sent while keeping the cards
 * face-up, because the first of the two taps has already put them down. One tap
 * gets them back.
 *
 * `null` when no window is open. Otherwise the timestamp of the last tap that
 * did not itself complete a pair.
 */
export type TapWindow = number | null;

export interface TapStep {
  readonly window: TapWindow;
  /**
   * Narrowed to the two events a tap can possibly be, so the caller reading
   * `DOUBLE_TAPPED` off it is checking an outcome this function can actually
   * produce rather than a name from the whole lifecycle union.
   */
  readonly event: Extract<CardEvent, { type: "TAPPED" | "DOUBLE_TAPPED" }>;
}

/**
 * Answer a tap that has just landed: on its own, or as the second half of a
 * double-tap.
 *
 * A completed pair closes the window rather than carrying the second tap
 * forward, so three taps in quick succession send **one** Check and start
 * counting again — a stream of taps cannot become a stream of Actions.
 */
export function tapLanded(window: TapWindow, now: number): TapStep {
  if (window !== null && now - window <= DOUBLE_TAP_MS) {
    return { window: null, event: { type: "DOUBLE_TAPPED" } };
  }
  return { window: now, event: { type: "TAPPED" } };
}

/**
 * Whether a double-tap Check should claim, visibly, that it landed (story 31).
 *
 * **Rendering only.** Whether the Action is *sent* is not decided here and not
 * decided by these two flags: `check` is `intent.check`, and `canAct` on the
 * latest view is the single gate (§2). This function answers the different
 * question of whether to tell the player it went — so a double-tap off-turn,
 * or while a Fold is in flight, is silent as well as inert, and a stale prop
 * can at worst confirm an Action the intent then refuses.
 */
export function confirmsCheck(
  actions: Pick<CardActions, "checkLegal" | "pending">,
): boolean {
  return actions.checkLegal && !actions.pending;
}
