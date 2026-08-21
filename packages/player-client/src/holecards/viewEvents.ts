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

export function eventsForPropChange(
  prev: HoleCardPairProps,
  next: HoleCardPairProps,
  state: CardState,
): readonly CardEvent[] {
  const events: CardEvent[] = [];

  if (next.cards === null) {
    if (prev.cards !== null && state.presentation !== "Absent") {
      events.push({ type: "CARDS_GONE" });
    }
  } else {
    if (!samePair(prev.cards, next.cards)) events.push({ type: "DEALT" });

    if (!prev.sealed && next.sealed) events.push({ type: "SEALED" });

    if (!prev.locked && next.locked) events.push({ type: "SHOWDOWN_REVEAL" });
  }

  if (
    next.cards !== null &&
    prev.actions.foldLegal &&
    !next.actions.foldLegal &&
    state.recognizer === "FoldDragging"
  ) {
    events.push({ type: "FOLD_DISARMED" });
  }

  if (!prev.actions.showLegal && next.actions.showLegal) {
    events.push({ type: "RESET" });
  }

  if (prev.actions.pending && !next.actions.pending) {
    events.push({ type: "PENDING_RESOLVED", hasCards: next.cards !== null });
  }

  return events;
}

export function eventsForVisibility(
  visibility: DocumentVisibilityState,
): readonly CardEvent[] {
  return visibility === "hidden" ? [{ type: "RESET" }] : [];
}
