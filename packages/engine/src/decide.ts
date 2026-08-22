import { apply } from "./apply.js";
import { revealedResultFor, winnersOf } from "./evaluate.js";
import {
  actingSeats,
  canStillAct,
  dealCommunityCards,
  facingBet,
  dealHoleCards,
  initialToAct,
  legalActions,
  liveSeats,
  nextStreetOf,
  rotateFromButton,
} from "./table.js";
import type {
  ActionType,
  BettingHandState,
  Command,
  EngineState,
  HandEvent,
  Rejection,
  RejectionReason,
  RevealedResult,
  SeatId,
  ShowdownCompleteHandState,
} from "./types.js";
import { must } from "./util.js";

function reject(reason: RejectionReason, command: Command): Rejection {
  return { type: "Rejection", reason, command };
}

function isLegal(
  hand: BettingHandState,
  actorSeat: SeatId,
  action: ActionType,
): boolean {
  return legalActions(hand, actorSeat).includes(action);
}

export function decide(
  state: EngineState,
  command: Command,
): HandEvent[] | Rejection {
  switch (command.type) {
    case "startHand": {
      if (state.hand !== null) {
        return reject("hand-already-in-progress", command);
      }
      return beginHand(state, command.seed);
    }

    case "nextHand": {
      if (state.hand?.status !== "complete") {
        return reject("stale-next-hand", command);
      }
      if (awaitingShowdown(state)?.winners === null) {
        return reject("showdown-unresolved", command);
      }
      return beginHand(state, command.seed);
    }

    case "fold":
    case "check":
    case "call":
    case "raise":
    case "allInCall":
    case "allInRaise":
      return decideAction(state, command);

    case "evict":
      return decideEviction(state, command);

    case "show":
      return decideShow(state, command);

    case "muck":
      return decideMuck(state, command);
  }
}

function awaitingShowdown(
  state: EngineState,
): ShowdownCompleteHandState | null {
  const hand = state.hand;
  if (hand?.status !== "complete" || hand.reason !== "showdown") return null;
  return hand;
}

/**
 * The showing window's gate: only its head may act, and only while it is open
 * — see ADR-0009.
 */
function headOfQueue(
  state: EngineState,
  command: Extract<Command, { type: "show" | "muck" }>,
): ShowdownCompleteHandState | Rejection {
  const hand = awaitingShowdown(state);
  const head = hand?.winners === null ? hand.queue[0] : undefined;
  if (hand === null || head === undefined) {
    return reject("not-at-showdown", command);
  }
  if (head !== command.seatId) return reject("not-your-turn", command);
  return hand;
}

/** The last contestant to resolve publishes the winners over the shown hands. */
function closingWinners(
  hand: ShowdownCompleteHandState,
  shown: RevealedResult | null,
): HandEvent[] {
  if (hand.queue.length > 1) return [];
  const results = shown === null ? hand.results : [...hand.results, shown];
  return [{ type: "WinnersDeclared", winners: winnersOf(results) }];
}

function decideShow(
  state: EngineState,
  command: Extract<Command, { type: "show" }>,
): HandEvent[] | Rejection {
  const hand = headOfQueue(state, command);
  if ("type" in hand) return hand;

  const contestant = must(
    hand.contestants.find((candidate) => candidate.seatId === command.seatId),
    "the head of the showing queue is always a contestant",
  );
  const result = revealedResultFor(hand.board, contestant);
  return [{ type: "HoleCardsShown", result }, ...closingWinners(hand, result)];
}

/** Mucking is barred until some hand is face-up: see Compulsion in ADR-0009. */
function decideMuck(
  state: EngineState,
  command: Extract<Command, { type: "muck" }>,
): HandEvent[] | Rejection {
  const hand = headOfQueue(state, command);
  if ("type" in hand) return hand;
  if (hand.results.length === 0) return reject("action-not-legal", command);

  return [
    { type: "HoleCardsMucked", seatId: command.seatId },
    ...closingWinners(hand, null),
  ];
}

function beginHand(state: EngineState, seed: string): HandEvent[] {
  const button = state.button;
  const ring = rotateFromButton(state.seats, button);

  const events: HandEvent[] = [];

  const handStarted: HandEvent = { type: "HandStarted", seed, button };
  events.push(handStarted);
  let scratch = apply(state, handStarted);

  const deals = dealHoleCards(seed, state.seats, ring);
  const holeCardsDealt: HandEvent = { type: "HoleCardsDealt", deals };
  events.push(holeCardsDealt);
  scratch = apply(scratch, holeCardsDealt);

  const toAct = initialToAct(ring, ring, button, "preflop");
  const streetStarted: HandEvent = {
    type: "StreetStarted",
    street: "preflop",
    actor: must(toAct[0], "preflop always has a first actor"),
  };
  events.push(streetStarted);
  apply(scratch, streetStarted);

  return events;
}

function decideAction(
  state: EngineState,
  command: Extract<Command, { type: ActionType }>,
): HandEvent[] | Rejection {
  if (state.hand?.status !== "betting") {
    return reject("hand-not-in-progress", command);
  }
  const hand = state.hand;

  const currentActor = must(
    hand.toAct[0],
    "a betting hand always has an actor",
  );
  if (command.seatId !== currentActor) {
    return reject("not-your-turn", command);
  }
  if (!isLegal(hand, currentActor, command.type)) {
    return reject("action-not-legal", command);
  }

  return decideActionEvents(state, currentActor, command.type);
}

function decideEviction(
  state: EngineState,
  command: Extract<Command, { type: "evict" }>,
): HandEvent[] | Rejection {
  if (state.hand?.status !== "betting") {
    return reject("hand-not-in-progress", command);
  }
  const player = state.hand.players.get(command.seatId);
  if (player === undefined || !canStillAct(player)) {
    return reject("action-not-legal", command);
  }

  return decideActionEvents(state, command.seatId, "fold");
}

function decideActionEvents(
  state: EngineState,
  seatId: SeatId,
  action: ActionType,
): HandEvent[] {
  const hand = asBetting(state);
  const events: HandEvent[] = [];

  const actionTaken: HandEvent = {
    type: "ActionTaken",
    seatId,
    action,
  };
  events.push(actionTaken);
  let scratch = apply(state, actionTaken);

  const live = liveSeats(asBetting(scratch));
  if (live.length === 1) {
    const foldedOut: HandEvent = {
      type: "HandFoldedOut",
      winner: must(live[0]),
    };
    events.push(foldedOut);
    scratch = apply(scratch, foldedOut);
    const handComplete: HandEvent = { type: "HandComplete" };
    events.push(handComplete);
    apply(scratch, handComplete);
    return events;
  }

  if (stillOwesADecision(asBetting(scratch))) {
    return events;
  }

  const streetClosed: HandEvent = {
    type: "StreetClosed",
    street: hand.street,
  };
  events.push(streetClosed);
  scratch = apply(scratch, streetClosed);

  if (hand.street === "river") {
    return finishAtShowdown(scratch, events);
  }

  scratch = dealNextStreet(state, scratch, events);

  const opened = asBetting(scratch);
  if (!canOpenABettingRound(opened)) {
    return runOut(state, scratch, events);
  }

  const nextToAct = initialToAct(
    opened.ring,
    actingSeats(opened),
    opened.button,
    opened.street,
  );
  const streetStarted: HandEvent = {
    type: "StreetStarted",
    street: opened.street,
    actor: must(nextToAct[0], "a fresh street always has a first actor"),
  };
  events.push(streetStarted);
  apply(scratch, streetStarted);

  return events;
}

const MIN_SEATS_TO_BET = 2;

function canOpenABettingRound(hand: BettingHandState): boolean {
  return actingSeats(hand).length >= MIN_SEATS_TO_BET;
}

function stillOwesADecision(hand: BettingHandState): boolean {
  if (hand.toAct.length === 0) return false;
  return (
    canOpenABettingRound(hand) ||
    hand.toAct.some((seat) => facingBet(hand, seat))
  );
}

function asBetting(state: EngineState): BettingHandState {
  if (state.hand?.status !== "betting") {
    throw new Error("expected a betting hand while resolving an action");
  }
  return state.hand;
}

function dealNextStreet(
  state: EngineState,
  scratch: EngineState,
  events: HandEvent[],
): EngineState {
  const hand = asBetting(scratch);
  const nextStreet = must(
    nextStreetOf(hand.street),
    "a non-river street always has a next street",
  );
  const cards = dealCommunityCards(
    hand.seed,
    state.seats.length,
    hand.board.length,
    nextStreet === "flop" ? FLOP_CARDS : 1,
  );
  const boardDealt: HandEvent = {
    type: "BoardDealt",
    street: nextStreet,
    cards,
  };
  events.push(boardDealt);
  return apply(scratch, boardDealt);
}

const FLOP_CARDS = 3;

function runOut(
  state: EngineState,
  scratch: EngineState,
  events: HandEvent[],
): HandEvent[] {
  let current = scratch;
  while (asBetting(current).street !== "river") {
    current = dealNextStreet(state, current, events);
  }
  return finishAtShowdown(current, events);
}

/** The window opens with every all-in contestant already tabled — ADR-0009. */
function finishAtShowdown(
  scratch: EngineState,
  events: HandEvent[],
): HandEvent[] {
  const showdownReached: HandEvent = {
    type: "ShowdownReached",
    contestants: liveSeats(asBetting(scratch)),
  };
  events.push(showdownReached);
  let current = apply(scratch, showdownReached);

  const opened = asShowdown(current);
  for (const contestant of opened.contestants.filter((c) => c.allIn)) {
    const shown: HandEvent = {
      type: "HoleCardsShown",
      result: revealedResultFor(opened.board, contestant),
    };
    events.push(shown);
    current = apply(current, shown);
  }

  const settled = asShowdown(current);
  if (settled.queue.length === 0) {
    const declared: HandEvent = {
      type: "WinnersDeclared",
      winners: winnersOf(settled.results),
    };
    events.push(declared);
    current = apply(current, declared);
  }

  const handComplete: HandEvent = { type: "HandComplete" };
  events.push(handComplete);
  apply(current, handComplete);
  return events;
}

function asShowdown(state: EngineState): ShowdownCompleteHandState {
  return must(awaitingShowdown(state), "expected a hand at showdown");
}
