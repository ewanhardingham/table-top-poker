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
 * (`FOLD_DISARMED`, `PENDING_RESOLVED`) consult; this slice's two events do
 * not depend on it.
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

  // Card identity, not reference: `PlayerView` carries no hand id, so cards
  // arriving is the deal signal — with a value comparison as the defensive
  // second signal for a betting→betting view that swaps cards without an
  // intervening empty one.
  return samePair(prev.cards, next.cards) ? [] : [{ type: "DEALT" }];
}
