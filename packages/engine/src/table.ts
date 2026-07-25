import { shuffledDeck } from "./deck.js";
import type { BettingHandState, Card, SeatId, Street } from "./types.js";
import { must } from "./util.js";

/** Reorders `seats` to start right after `button` and end at `button`. */
export function rotateFromButton(
  seats: readonly SeatId[],
  button: SeatId,
): SeatId[] {
  const idx = seats.indexOf(button);
  return [...seats.slice(idx + 1), ...seats.slice(0, idx + 1)];
}

export function nextButtonAfter(
  seats: readonly SeatId[],
  button: SeatId,
): SeatId {
  const idx = seats.indexOf(button);
  return must(seats[(idx + 1) % seats.length]);
}

function seatState(hand: BettingHandState, seat: SeatId) {
  return must(hand.players.get(seat), `unknown seat ${String(seat)}`);
}

export function liveSeats(hand: BettingHandState): SeatId[] {
  return hand.ring.filter((seat) => !seatState(hand, seat).folded);
}

/**
 * The action order and whether the big blind's one-time preflop "option" is
 * still pending, for the start of a street.
 *
 * Ordinary streets (and heads-up preflop, where the two-seat order already
 * ends at the big blind) close as soon as every live seat has acted once
 * with no raise: closure falls straight out of `toAct` draining to empty.
 * Preflop with 3+ live players is the one case that doesn't reduce to a
 * single lap — the big blind sits mid-order (`ring[1]`), not last, so it
 * needs an explicit flag: once the first lap (SB, BB, ..., button) drains
 * with no raise, the big blind gets one final visit before the street can
 * close (`bbOptionPending`, consumed in `apply`'s `ActionTaken` handling).
 */
export function initialToAct(
  ring: readonly SeatId[],
  live: readonly SeatId[],
  button: SeatId,
  street: Street,
): { toAct: SeatId[]; bbOptionPending: boolean } {
  const isHeadsUp = live.length === 2;

  const toAct =
    street === "preflop" && isHeadsUp
      ? [button, ...live.filter((seat) => seat !== button)]
      : ring.filter((seat) => live.includes(seat));

  return { toAct, bbOptionPending: street === "preflop" && !isHeadsUp };
}

/**
 * The big blind's seat for the whole hand: `ring[1]` (button+2) with 3+
 * seats; in heads-up (`ring` has exactly 2 seats, `[other, button]`) the
 * non-button seat is the big blind instead.
 */
export function bigBlindSeat(ring: readonly SeatId[], button: SeatId): SeatId {
  if (ring.length === 2) {
    return must(
      ring.find((seat) => seat !== button),
      "heads-up needs a non-button seat",
    );
  }
  return must(ring[1], "the big blind needs at least 3 seated players");
}

/**
 * Whether `actorSeat` still owes a call/fold/raise this street, absent a
 * value-tracked pot: no chip amount is ever stored (CONTEXT.md, §1 of the
 * Phase 1 spec still hold — the engine never tracks a Pot), but the blinds'
 * *legality* still has to mirror physical chips already in the middle. Every
 * seat faces a bet once someone has actually raised; preflop, before that,
 * every seat except the big blind also faces a bet — the big blind's own
 * post already matches it, which is exactly why the big blind alone may
 * check on an unraised preflop (their normal turn, or their later option).
 */
export function facingBet(
  hand: Pick<BettingHandState, "street" | "ring" | "button" | "raiseOccurred">,
  actorSeat: SeatId,
): boolean {
  if (hand.raiseOccurred) return true;
  return (
    hand.street === "preflop" &&
    actorSeat !== bigBlindSeat(hand.ring, hand.button)
  );
}

/**
 * After a raise, every other live seat gets one more turn, in position order
 * starting right after the raiser, ending right before them again — the
 * raiser isn't re-added; the street closes once this queue drains.
 */
export function requeueAfterRaise(
  ring: readonly SeatId[],
  players: ReadonlyMap<SeatId, { readonly folded: boolean }>,
  raiser: SeatId,
): SeatId[] {
  const idx = ring.indexOf(raiser);
  const result: SeatId[] = [];
  for (let step = 1; step < ring.length; step++) {
    const candidate = must(ring[(idx + step) % ring.length]);
    if (!must(players.get(candidate)).folded) {
      result.push(candidate);
    }
  }
  return result;
}

const STREET_AFTER: Record<
  Exclude<Street, "river">,
  "flop" | "turn" | "river"
> = {
  preflop: "flop",
  flop: "turn",
  turn: "river",
};

export function nextStreetOf(street: Street): "flop" | "turn" | "river" | null {
  return street === "river" ? null : STREET_AFTER[street];
}

/**
 * Hole cards and board cards are all drawn from the same seed-derived deck,
 * sliced deterministically by position — no deck state is ever stored, so
 * the remaining deck order is never reachable from engine state.
 */
export function dealHoleCards(
  seed: string,
  seats: readonly SeatId[],
  ring: readonly SeatId[],
): { seatId: SeatId; cards: [Card, Card] }[] {
  const deck = shuffledDeck(seed);
  const bySeat = new Map<SeatId, Card[]>(seats.map((seat) => [seat, []]));
  let pos = 0;
  for (let round = 0; round < 2; round++) {
    for (const seat of ring) {
      must(bySeat.get(seat)).push(must(deck[pos]));
      pos++;
    }
  }
  return ring.map((seatId) => {
    const cards = must(bySeat.get(seatId));
    return { seatId, cards: [must(cards[0]), must(cards[1])] };
  });
}

export function dealCommunityCards(
  seed: string,
  numSeats: number,
  boardLenSoFar: number,
  count: number,
): Card[] {
  const deck = shuffledDeck(seed);
  const start = numSeats * 2 + boardLenSoFar;
  return deck.slice(start, start + count);
}
