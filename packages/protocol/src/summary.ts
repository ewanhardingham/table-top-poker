import type { Card, HandEvent, SeatId, Street } from "@table-top-poker/engine";

/**
 * How the betting went, as a descriptor rather than a sentence (Phase 2
 * spec #129 §5). The felt's wording — *walk — folded round*, *raise war — 4
 * raises* — lives in `table-client` with the rest of its copy; putting it
 * here would force the dev stepper (§7) to parse English back into a number
 * `summarise` already had.
 */
export type BettingShape =
  | { readonly kind: "walk" }
  | { readonly kind: "preflop-raise" }
  | { readonly kind: "checked-down" }
  | { readonly kind: "one-raise" }
  | { readonly kind: "raise-war"; readonly raises: number };

/**
 * One seat's showdown hand as the whole room saw it. Reveals only ever come
 * from a `ShowdownReached` event, which the engine emits solely for seats
 * that reached showdown live — so nothing here widens the visibility
 * boundary (Phase 1 spec #130 §4).
 */
export interface ShowdownReveal {
  readonly seatId: SeatId;
  readonly bestHand: readonly [Card, Card, Card, Card, Card];
  readonly description: string;
}

export type HandOutcome =
  | { readonly kind: "folded-out"; readonly winner: SeatId }
  | {
      readonly kind: "showdown";
      readonly winners: readonly SeatId[];
      readonly reveals: readonly ShowdownReveal[];
    };

/**
 * The two facts about a hand that its own Events cannot answer: where it sits
 * in the session, and when it began. Everything else in a `HandSummary` is
 * derived, which is what keeps `summarise` free of a clock and of ambient
 * state.
 *
 * Deliberately *not* named `HandContext`: that term is taken, and means the
 * four-field document a Hand recording opens with (`CONTEXT.md`). This is a
 * strict subset — the Seats and Button it also carries are derivable from the
 * Events, so asking a caller for them would invite two answers to one
 * question.
 */
export interface HandSummaryContext {
  /** 1-based, matching the recording's `hand-NNNN` partition. */
  readonly handOrdinal: number;
  /** ISO 8601 — the picker's start-time clock reads this (§6). */
  readonly startedAt: string;
}

/** One row of the table device's hand picker, derived once and shared (§5). */
export interface HandSummary {
  readonly handOrdinal: number;
  readonly startedAt: string;
  readonly button: SeatId;
  /** Every seat the hand was dealt to, in deal order — folds never remove one. */
  readonly seatsDealtIn: readonly SeatId[];
  /** The seats that never folded; one on a fold-out, two or more at showdown. */
  readonly survivors: readonly SeatId[];
  readonly board: readonly Card[];
  readonly streetReached: Street;
  readonly bettingShape: BettingShape;
  readonly outcome: HandOutcome;
}

/** Raised when a recording is not a complete, valid hand — never for a well-formed one. */
export class IncompleteHandError extends Error {}

/**
 * The five shapes partition every hand, and the spec fixes the union without
 * fixing the predicates. Two boundary calls are made here deliberately:
 *
 * 1. **Two or more raises reads as a war wherever it happened**, so a preflop
 *    3-bet that ends preflop is `raise-war`, not `preflop-raise`. The count is
 *    the more informative fact, and `preflop-raise` — "preflop raise took it"
 *    — describes *one* raise winning uncontested.
 * 2. **`checked-down` is the residual**, so it also covers an unraised hand
 *    that saw a flop and then folded out. `walk` is reserved for the hand that
 *    died preflop, which is the distinction the picker needs (a walk is a
 *    visibly short row). The felt's copy for `checked-down` should therefore
 *    not promise a showdown — that is a `table-client` wording decision.
 */
function bettingShapeOf(
  raises: number,
  streetReached: Street,
  outcome: HandOutcome,
): BettingShape {
  if (raises >= 2) return { kind: "raise-war", raises };
  const diedPreflop =
    outcome.kind === "folded-out" && streetReached === "preflop";
  if (raises === 1)
    return diedPreflop ? { kind: "preflop-raise" } : { kind: "one-raise" };
  return diedPreflop ? { kind: "walk" } : { kind: "checked-down" };
}

/**
 * Derives a hand's picker summary from the Events it produced.
 *
 * Pure: no I/O, no clock, no ambient state. The server calls it with the
 * Events it just broadcast; anything replaying from disk calls it with the
 * Events it just validated. Sharing one derivation is the point — two
 * independent ones would drift, and the picker would disagree with the scrub
 * it opens (Phase 2 spec #129 §5).
 *
 * Throws `IncompleteHandError` unless `events` is a complete hand: it must
 * open with `HandStarted`, close with `HandComplete`, and carry an outcome.
 * Callers holding a partial recording are expected to keep it out of the
 * listing rather than summarise it (§4).
 */
export function summarise(
  events: readonly HandEvent[],
  context: HandSummaryContext,
): HandSummary {
  const started = events.find((event) => event.type === "HandStarted");
  if (started === undefined) {
    throw new IncompleteHandError("hand recording has no HandStarted event");
  }
  if (!events.some((event) => event.type === "HandComplete")) {
    throw new IncompleteHandError("hand recording has no HandComplete event");
  }

  const seatsDealtIn: SeatId[] = [];
  const folded = new Set<SeatId>();
  const board: Card[] = [];
  let streetReached: Street = "preflop";
  let raises = 0;
  let outcome: HandOutcome | undefined;

  for (const event of events) {
    switch (event.type) {
      case "HoleCardsDealt":
        for (const deal of event.deals) seatsDealtIn.push(deal.seatId);
        break;
      case "StreetStarted":
        streetReached = event.street;
        break;
      case "ActionTaken":
        if (event.action === "fold") folded.add(event.seatId);
        if (event.action === "raise") raises += 1;
        break;
      case "BoardDealt":
        board.push(...event.cards);
        break;
      case "HandFoldedOut":
        outcome = { kind: "folded-out", winner: event.winner };
        break;
      case "ShowdownReached":
        outcome = {
          kind: "showdown",
          winners: [...event.winners],
          reveals: event.results.map(({ seatId, bestHand, description }) => ({
            seatId,
            bestHand: [...bestHand] as [Card, Card, Card, Card, Card],
            description,
          })),
        };
        break;
      default:
        break;
    }
  }

  if (outcome === undefined) {
    throw new IncompleteHandError(
      "hand recording completed with no outcome event",
    );
  }

  return {
    handOrdinal: context.handOrdinal,
    startedAt: context.startedAt,
    button: started.button,
    seatsDealtIn,
    survivors: seatsDealtIn.filter((seatId) => !folded.has(seatId)),
    board,
    streetReached,
    bettingShape: bettingShapeOf(raises, streetReached, outcome),
    outcome,
  };
}
