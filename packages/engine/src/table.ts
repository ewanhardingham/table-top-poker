import { shuffledDeck } from "./deck.js";
import type {
  ActionType,
  BettingHandState,
  Card,
  SeatId,
  Street,
} from "./types.js";
import { must } from "./util.js";

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

const BLIND_COUNT = 2;

function isHeadsUp(ring: readonly SeatId[]): boolean {
  return ring.length === BLIND_COUNT;
}

export function smallBlindSeat(
  ring: readonly SeatId[],
  button: SeatId,
): SeatId {
  if (isHeadsUp(ring)) return button;
  return must(ring[0], "the small blind needs at least 2 seated players");
}

export function bigBlindSeat(ring: readonly SeatId[], button: SeatId): SeatId {
  if (isHeadsUp(ring)) {
    return must(
      ring.find((seat) => seat !== button),
      "heads-up needs a non-button seat",
    );
  }
  return must(ring[1], "the big blind needs at least 3 seated players");
}

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

export function legalActions(
  hand: Pick<BettingHandState, "street" | "ring" | "button" | "raiseOccurred">,
  actorSeat: SeatId,
): ActionType[] {
  return facingBet(hand, actorSeat)
    ? ["fold", "call", "raise"]
    : ["fold", "check", "raise"];
}

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
