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
 * `state` is the current lifecycle state, which the later arms
 * (`FOLD_DISARMED`, `PENDING_RESOLVED`) consult; of the events derived so far
 * only `CARDS_GONE` does.
 */
export function eventsForPropChange(
  prev: HoleCardPairProps,
  next: HoleCardPairProps,
  state: CardState,
): readonly CardEvent[] {
  if (next.cards === null) {
    // An event is a transition, never a restatement: a pair already showing
    // nothing has nothing to be told.
    if (prev.cards === null || state.presentation === "Absent") return [];
    return [{ type: "CARDS_GONE" }];
  }

  const events: CardEvent[] = [];

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
