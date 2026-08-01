import { apply } from "./apply.js";
import { evaluate, winnersOf } from "./evaluate.js";
import {
  dealCommunityCards,
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
  Card,
  Command,
  EngineState,
  HandEvent,
  Rejection,
  RejectionReason,
  SeatId,
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
      return beginHand(state, command.seed);
    }

    case "fold":
    case "check":
    case "call":
    case "raise":
      return decideAction(state, command);

    case "evict":
      return decideEviction(state, command);
  }
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

  const { toAct } = initialToAct(ring, ring, button, "preflop");
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
  if (command.playerId !== currentActor) {
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
  const player = state.hand.players.get(command.playerId);
  if (player === undefined || player.folded) {
    return reject("action-not-legal", command);
  }

  return decideActionEvents(state, command.playerId, "fold");
}

function decideActionEvents(
  state: EngineState,
  seatId: SeatId,
  action: ActionType,
): HandEvent[] {
  const hand = state.hand;
  if (hand?.status !== "betting") {
    throw new Error("expected a betting hand while resolving an action");
  }
  const events: HandEvent[] = [];

  const actionTaken: HandEvent = {
    type: "ActionTaken",
    seatId,
    action,
  };
  events.push(actionTaken);
  let scratch = apply(state, actionTaken);
  const handAfterAction = scratch.hand as BettingHandState;

  const live = liveSeats(handAfterAction);
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

  if (handAfterAction.toAct.length > 0) {
    return events;
  }

  const streetClosed: HandEvent = {
    type: "StreetClosed",
    street: hand.street,
  };
  events.push(streetClosed);
  scratch = apply(scratch, streetClosed);

  if (hand.street === "river") {
    const results = live.map((seatId) => {
      const holeCards = must(
        handAfterAction.players.get(seatId)?.holeCards,
        "a live seat at showdown always has hole cards",
      );
      const { rank, bestHand, description } = evaluate([
        ...holeCards,
        ...handAfterAction.board,
      ]);
      return {
        seatId,
        rank,
        bestHand: [...bestHand] as [Card, Card, Card, Card, Card],
        description,
      };
    });
    const showdownReached: HandEvent = {
      type: "ShowdownReached",
      results,
      winners: winnersOf(results),
    };
    events.push(showdownReached);
    scratch = apply(scratch, showdownReached);
    const handComplete: HandEvent = { type: "HandComplete" };
    events.push(handComplete);
    apply(scratch, handComplete);
    return events;
  }

  const nextStreet = must(
    nextStreetOf(hand.street),
    "a non-river street always has a next street",
  );
  const count = nextStreet === "flop" ? 3 : 1;
  const cards = dealCommunityCards(
    hand.seed,
    state.seats.length,
    hand.board.length,
    count,
  );
  const boardDealt: HandEvent = {
    type: "BoardDealt",
    street: nextStreet,
    cards,
  };
  events.push(boardDealt);
  scratch = apply(scratch, boardDealt);

  const { toAct: nextToAct } = initialToAct(
    handAfterAction.ring,
    live,
    hand.button,
    nextStreet,
  );
  const streetStarted: HandEvent = {
    type: "StreetStarted",
    street: nextStreet,
    actor: must(nextToAct[0], "a fresh street always has a first actor"),
  };
  events.push(streetStarted);
  apply(scratch, streetStarted);

  return events;
}
