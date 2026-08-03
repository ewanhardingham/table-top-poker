import type { Card } from "@table-top-poker/protocol";
import type { CardEvent, CardState } from "./cardState.js";
import type { HoleCardPairProps } from "./HoleCardPair.js";

function sameCard(a: Card, b: Card): boolean {
  return a.rank === b.rank && a.suit === b.suit;
}

function samePair(
  a: readonly [Card, Card] | null,
  b: readonly [Card, Card] | null,
): boolean {
  if (a === null || b === null) return a === b;
  return sameCard(a[0], b[0]) && sameCard(a[1], b[1]);
}

/**
 * The one place a server-shaped input becomes a lifecycle event (Phase 3 spec
 * #138 §8). The reducer never sees a `PlayerView`, and the hook decides
 * nothing. Keeping the derivation pure is what makes "an incoming view is
 * inert" a tested property rather than a remembered one.
 *
 * **The default return is the empty array.** `fanOutHandUpdate` sends a
 * `hand-update` for every event in the hand, and peeking at your cards is
 * exactly what you do while others act — so a new street, a new board card,
 * another player's bet and a changed `toAct` must all produce nothing.
 *
 * `state` is the current lifecycle state; `CARDS_GONE` and `FOLD_DISARMED`
 * consult it. Fold legality disappearing under a live drag is the one §8
 * disturbance that must reach an in-progress gesture. If the same view also
 * removes the cards (clock expiry or eviction), `CARDS_GONE` ends the gesture
 * and is the only event needed.
 */
export function eventsForPropChange(
  prev: HoleCardPairProps,
  next: HoleCardPairProps,
  state: CardState,
): readonly CardEvent[] {
  const events: CardEvent[] = [];

  if (next.cards === null) {
    // An event is a transition, never a restatement: a pair already showing
    // nothing has nothing to be told.
    if (prev.cards !== null && state.presentation !== "Absent") {
      events.push({ type: "CARDS_GONE" });
    }
  } else {
    // Card identity, not reference: `PlayerView` carries no hand id, so cards
    // arriving is the deal signal — with a value comparison as the defensive
    // second signal for a betting→betting view that swaps cards without an
    // intervening empty one.
    if (!samePair(prev.cards, next.cards)) events.push({ type: "DEALT" });

    // Ordered after the deal deliberately: a seat whose cards only arrive at
    // showdown must be dealt in before it is revealed, or the reveal lands on a
    // pair that is still `Absent`. Losing the lock produces nothing — showdown
    // does not un-reveal, and the next hand's `DEALT` is what turns the cards
    // back over.
    if (!prev.locked && next.locked) events.push({ type: "SHOWDOWN_REVEAL" });
  }

  // A Fold drag keeps following the finger when its legality disappears. The
  // card removal that accompanies an expiry or eviction ends the gesture
  // through `CARDS_GONE`, so there is no separate disarm event in that case.
  if (
    next.cards !== null &&
    prev.actions.foldLegal &&
    !next.actions.foldLegal &&
    state.recognizer === "FoldDragging"
  ) {
    events.push({ type: "FOLD_DISARMED" });
  }

  // Only the falling edge, and only a Fold is waiting on it: the pair moved
  // itself to `Leaving` on the release that sent the Action, so the prop going
  // *true* has nothing left to say (§7). Whether the answer was an
  // acknowledgement or a rejection is read off the cards rather than off any
  // rejection state — the server taking them is what "acknowledged" means here,
  // and the reducer needs no second opinion.
  if (prev.actions.pending && !next.actions.pending) {
    events.push({ type: "PENDING_RESOLVED", hasCards: next.cards !== null });
  }

  return events;
}

/**
 * The app leaving the foreground is a reset (§9), and it is the one
 * disturbance that does not arrive as a prop change — `visibilitychange` is a
 * document event, subscribed by the hook (§8). It is derived here anyway so
 * the rule is a tested function call rather than a condition buried in an
 * effect, which is the same reason `eventsForPropChange` exists.
 *
 * Only the outbound edge produces anything: coming back is not a second
 * disturbance, and concealing cards the Player has since turned over would be.
 */
export function eventsForVisibility(
  visibility: DocumentVisibilityState,
): readonly CardEvent[] {
  return visibility === "hidden" ? [{ type: "RESET" }] : [];
}
