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

/** The big blind's seat — `ring[1]`, valid whenever preflop isn't heads-up. */
export function bigBlindSeat(ring: readonly SeatId[]): SeatId {
  return must(ring[1], "the big blind needs at least 3 seated players");
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
