import {
  bigBlindSeat,
  initialToAct,
  nextButtonAfter,
  requeueAfterRaise,
  rotateFromButton,
  smallBlindSeat,
} from "./table.js";
import type { BettingHandState, EngineState, HandEvent } from "./types.js";
import { must } from "./util.js";

function asBetting(state: EngineState): BettingHandState {
  if (state.hand?.status !== "betting") {
    throw new Error("expected an in-progress hand");
  }
  return state.hand;
}

function seatState(hand: BettingHandState, seat: number) {
  return must(hand.players.get(seat), `unknown seat ${String(seat)}`);
}

/**
 * The positional facts a completed hand has to keep once `ring` is dropped:
 * both blind seats and the size of the field they were dealt from. Resolved
 * here, while `ring` is still in scope, so `view` reports the same ids in
 * every phase — and so the button's rotation on `HandComplete` can't reach
 * back and change what the finished hand says about itself.
 */
function resolvedBlinds(hand: BettingHandState) {
  return {
    smallBlind: smallBlindSeat(hand.ring, hand.button),
    bigBlind: bigBlindSeat(hand.ring, hand.button),
    dealtSeatCount: hand.ring.length,
  };
}

/** Pure reducer: folds one event into state. Never mutates its input. */
export function apply(state: EngineState, event: HandEvent): EngineState {
  switch (event.type) {
    case "HandStarted": {
      const ring = rotateFromButton(state.seats, event.button);
      return {
        ...state,
        button: event.button,
        hand: {
          status: "betting",
          seed: event.seed,
          button: event.button,
          ring,
          street: "preflop",
          board: [],
          players: new Map(
            state.seats.map((seat) => [
              seat,
              { holeCards: null, folded: false },
            ]),
          ),
          toAct: [],
          raiseOccurred: false,
        },
      };
    }

    case "HoleCardsDealt": {
      const hand = asBetting(state);
      const players = new Map(hand.players);
      for (const deal of event.deals) {
        const prior = seatState(hand, deal.seatId);
        players.set(deal.seatId, { ...prior, holeCards: deal.cards });
      }
      return { ...state, hand: { ...hand, players } };
    }

    case "StreetStarted": {
      const hand = asBetting(state);
      const live = hand.ring.filter((seat) => !seatState(hand, seat).folded);
      const toAct = initialToAct(hand.ring, live, hand.button, event.street);
      return {
        ...state,
        hand: {
          ...hand,
          street: event.street,
          toAct,
          raiseOccurred: false,
        },
      };
    }

    case "ActionTaken": {
      const hand = asBetting(state);
      const players = new Map(hand.players);
      if (event.action === "fold") {
        const prior = seatState(hand, event.seatId);
        players.set(event.seatId, { ...prior, folded: true });
      }
      const raiseOccurred = hand.raiseOccurred || event.action === "raise";

      // Ordinary actions always belong to `toAct[0]`; an eviction may fold a
      // live seat later in the queue, so remove the event's seat by identity
      // and leave the current actor at the head of the queue.
      const toAct =
        event.action === "raise"
          ? requeueAfterRaise(hand.ring, players, event.seatId)
          : hand.toAct.filter((seat) => seat !== event.seatId);

      return {
        ...state,
        hand: { ...hand, players, raiseOccurred, toAct },
      };
    }

    case "StreetClosed":
      return state;

    case "BoardDealt": {
      const hand = asBetting(state);
      return {
        ...state,
        hand: { ...hand, board: [...hand.board, ...event.cards] },
      };
    }

    case "HandFoldedOut": {
      const hand = asBetting(state);
      return {
        ...state,
        hand: {
          status: "complete",
          reason: "folded-out",
          seed: hand.seed,
          button: hand.button,
          ...resolvedBlinds(hand),
          winner: event.winner,
        },
      };
    }

    case "ShowdownReached": {
      const hand = asBetting(state);
      const results = event.results.map((result) => ({
        ...result,
        holeCards: must(
          seatState(hand, result.seatId).holeCards,
          "a live seat at showdown always has hole cards",
        ),
      }));
      return {
        ...state,
        hand: {
          status: "complete",
          reason: "showdown",
          seed: hand.seed,
          button: hand.button,
          ...resolvedBlinds(hand),
          board: hand.board,
          results,
          winners: event.winners,
        },
      };
    }

    case "HandComplete": {
      if (state.hand?.status !== "complete") {
        throw new Error("expected the hand to already be complete");
      }
      return {
        ...state,
        button: nextButtonAfter(state.seats, state.button),
        hand: state.hand,
      };
    }
  }
}
