import type { Card, HandEvent, SeatId, Street } from "@table-top-poker/engine";

/** Structured, never prose — see Betting shape in `CONTEXT.md`. */
export type BettingShape =
  | { readonly kind: "walk" }
  | { readonly kind: "preflop-raise" }
  | { readonly kind: "checked-down" }
  | { readonly kind: "one-raise" }
  | { readonly kind: "raise-war"; readonly raises: number };

/** One seat's showdown hand; sourced only from `ShowdownReached`, so it widens no visibility. */
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
  /** ISO 8601 — the picker's start-time clock reads this (#129 §6). */
  readonly startedAt: string;
}

/** One row of the table device's hand picker, derived once and shared (#129 §5). */
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

/** See Betting shape in `CONTEXT.md` for the two boundary calls. */
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
 * Derives a hand's picker summary from the Events it produced — pure, and the
 * one derivation the live push and a replay from disk share.
 *
 * Throws `IncompleteHandError` unless `events` opens with `HandStarted`,
 * closes with `HandComplete`, and carries an outcome.
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
