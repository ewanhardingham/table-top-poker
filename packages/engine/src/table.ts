import { shuffledDeck } from "./deck.js";
import type {
  ActionType,
  BettingHandState,
  Card,
  SeatId,
  Street,
} from "./types.js";
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
 * The action order for the start of a street: the live seats, in the order
 * they owe a decision.
 *
 * Postflop runs the ring as-is, small blind through button. Preflop with
 * 3+ seats starts "with the first player to the left of the blinds"
 * (Robert's Rules of Poker, "Button and Blind Use") — the ring rotated two
 * seats, `UTG, ..., BTN, SB, BB`. Heads-up the small blind is on the
 * button and acts first, so the order is `BTN/SB, BB`.
 *
 * The big blind is last in every case, so their one-time "option" needs no
 * special machinery: every street closes the same way, when `toAct` drains.
 * Heads-up is decided off the ring, via the same `isHeadsUp` the blind
 * seats use — a short-handed lap must never read as heads-up and disagree
 * with the blind positions it was dealt with.
 */
export function initialToAct(
  ring: readonly SeatId[],
  live: readonly SeatId[],
  button: SeatId,
  street: Street,
): SeatId[] {
  if (street !== "preflop") return ring.filter((seat) => live.includes(seat));

  const order = isHeadsUp(ring)
    ? [button, ...ring.filter((seat) => seat !== button)]
    : [...ring.slice(BLIND_COUNT), ...ring.slice(0, BLIND_COUNT)];

  return order.filter((seat) => live.includes(seat));
}

/**
 * The two blind seats at the head of the ring, `[SB, BB]` — the rotation
 * preflop action skips past, and the reason `initialToAct` opens at
 * `ring[2]`.
 */
const BLIND_COUNT = 2;

/**
 * Whether this hand is heads-up, off the seats it was dealt to rather than
 * the seats still live. Every position rule that reads differently heads-up
 * — both blind seats and the preflop order — asks this one question, so
 * they cannot disagree with each other partway through a hand.
 */
function isHeadsUp(ring: readonly SeatId[]): boolean {
  return ring.length === BLIND_COUNT;
}

/**
 * The small blind's seat for the whole hand: `ring[0]` (button+1) with 3+
 * seats; in heads-up the button posts the small blind, so the two coincide.
 * Ring order, never seat-number arithmetic — seats need not be contiguous.
 */
export function smallBlindSeat(
  ring: readonly SeatId[],
  button: SeatId,
): SeatId {
  if (isHeadsUp(ring)) return button;
  return must(ring[0], "the small blind needs at least 2 seated players");
}

/**
 * The big blind's seat for the whole hand: `ring[1]` (button+2) with 3+
 * seats; in heads-up (`ring` has exactly 2 seats, `[other, button]`) the
 * non-button seat is the big blind instead.
 */
export function bigBlindSeat(ring: readonly SeatId[], button: SeatId): SeatId {
  if (isHeadsUp(ring)) {
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
 * check on an unraised preflop. Preflop that turn is the last of the lap,
 * so it is also the big blind's "option".
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
 * The full set of actions `actorSeat` may legally take right now — fold and
 * raise are always available; check and call are mutually exclusive and
 * follow `facingBet` (see its own doc comment for the preflop/big-blind
 * subtlety). The single source of truth for action legality, consumed by
 * both `decide` (server-side enforcement) and `view` (the client-facing
 * `legalActions` field) so the two can never drift apart.
 */
export function legalActions(
  hand: Pick<BettingHandState, "street" | "ring" | "button" | "raiseOccurred">,
  actorSeat: SeatId,
): ActionType[] {
  return facingBet(hand, actorSeat)
    ? ["fold", "call", "raise"]
    : ["fold", "check", "raise"];
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
