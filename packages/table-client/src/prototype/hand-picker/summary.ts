/**
 * PROTOTYPE — throwaway, wayfinder ticket #81. Not production code.
 *
 * The summary shape a hand picker could render, derived *only* from what the
 * table device was entitled to see live (map #79's visibility rule):
 *
 * - `BoardDealt` is public, so a fold-out hand still has whatever board it
 *   reached — note `FoldedOutView` (packages/engine/src/view.ts) drops the
 *   board, so this is recovered from the event stream, not the terminal view.
 * - `ActionTaken` is public for every seat, so the *shape* of the betting is
 *   available even when nothing was revealed.
 * - `ShowdownReached` carries hole cards and descriptions; a fold-out reveals
 *   only the winner. Nothing here peeks past that.
 * - `startedAt` is now durable per-Hand context (wayfinder ticket #86's
 *   resolution), so — unlike the rest of this file — it is *not* recovered
 *   from the event stream. Whether it belongs in the player-facing summary at
 *   all, and if so how it's shown, is wayfinder ticket #87, prototyped in
 *   `clock.ts` and wired into `VariantA`'s row via `clockMode`.
 *
 * Commands and Events remain untimestamped, so a hand's only *internal*
 * "when" is still its ordinal — `startedAt` marks only the Hand's start.
 */
import type { ActionType, Card, SeatId, Street } from "@table-top-poker/protocol";

export interface SummaryAction {
  readonly seatId: SeatId;
  readonly action: ActionType;
}

export interface SummaryReveal {
  readonly seatId: SeatId;
  readonly holeCards: readonly [Card, Card];
  readonly description: string;
}

export type HandOutcome =
  | { readonly kind: "folded-out"; readonly winner: SeatId }
  | {
      readonly kind: "showdown";
      readonly winners: readonly SeatId[];
      readonly reveals: readonly SummaryReveal[];
    }
  | { readonly kind: "in-progress" };

export interface HandSummary {
  /** 1-based, from the `hand-NNNN` log partition. The only ordering key there is. */
  readonly handNumber: number;
  /** ISO instant the Hand's context was recorded. See ticket #87 above. */
  readonly startedAt: string;
  readonly button: SeatId;
  readonly dealtIn: readonly SeatId[];
  /** Public board, up to the street the hand died on. Empty for a preflop fold-out. */
  readonly board: readonly Card[];
  readonly lastStreet: Street;
  readonly actions: readonly SummaryAction[];
  readonly outcome: HandOutcome;
}

export const streetOrder: readonly Street[] = ["preflop", "flop", "turn", "river"];

/** How many seats were still live when the last street opened. */
export function survivors(hand: HandSummary): readonly SeatId[] {
  const folded = new Set(
    hand.actions.filter((a) => a.action === "fold").map((a) => a.seatId),
  );
  return hand.dealtIn.filter((seatId) => !folded.has(seatId));
}

export function raiseCount(hand: HandSummary): number {
  return hand.actions.filter((a) => a.action === "raise").length;
}

/**
 * A one-phrase characterisation of the betting, from public actions only.
 * This is the prototype's bet on what makes a *fold-out* hand distinguishable
 * from the next fold-out hand.
 */
export function actionShape(hand: HandSummary): string {
  const raises = raiseCount(hand);
  if (hand.outcome.kind === "in-progress") return "still running";
  if (hand.lastStreet === "preflop" && hand.outcome.kind === "folded-out") {
    return raises === 0 ? "walk — folded round" : "preflop raise took it";
  }
  if (raises === 0) return "checked down";
  if (raises >= 3) return `raise war — ${String(raises)} raises`;
  if (raises === 1) return "one raise";
  return `${String(raises)} raises`;
}

export function seatLabel(seatId: SeatId): string {
  return `Seat ${String(seatId + 1)}`;
}

export function winnersOf(hand: HandSummary): readonly SeatId[] {
  if (hand.outcome.kind === "folded-out") return [hand.outcome.winner];
  if (hand.outcome.kind === "showdown") return hand.outcome.winners;
  return [];
}

/** The headline the table could honestly print for a hand. */
export function outcomeText(hand: HandSummary): string {
  const { outcome } = hand;
  if (outcome.kind === "in-progress") return "In progress";
  if (outcome.kind === "folded-out") {
    return `${seatLabel(outcome.winner)} wins — everyone folded`;
  }
  const names = outcome.winners.map(seatLabel).join(" & ");
  const verb = outcome.winners.length > 1 ? "split" : "wins";
  const description = outcome.reveals.find((r) =>
    outcome.winners.includes(r.seatId),
  )?.description;
  return description ? `${names} ${verb} — ${description}` : `${names} ${verb}`;
}
