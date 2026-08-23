import {
  bigBlindSeat,
  canStillAct,
  HOLE_CARDS,
  initialToAct,
  isAllIn,
  nextButtonAfter,
  reopensBetting,
  requeueAfterRaise,
  rotateFromButton,
  showingOrder,
  smallBlindSeat,
} from "./table.js";
import type {
  BettingHandState,
  Contestant,
  EngineState,
  HandEvent,
  ShowdownCompleteHandState,
} from "./types.js";
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

function asAwaitingShowdown(state: EngineState): ShowdownCompleteHandState {
  const hand = state.hand;
  if (hand?.status !== "complete" || hand.reason !== "showdown") {
    throw new Error("expected a hand at showdown");
  }
  return hand;
}

function handPositions(hand: BettingHandState) {
  return {
    smallBlind: smallBlindSeat(hand.ring, hand.button),
    bigBlind: bigBlindSeat(hand.ring, hand.button),
    dealtSeatCount: hand.ring.length,
    burnedCount: hand.burned.length,
  };
}

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
          burned: [],
          cardsDealt: 0,
          players: new Map(
            state.seats.map((seat) => [
              seat,
              { holeCards: null, folded: false, allIn: false },
            ]),
          ),
          toAct: [],
          raiseOccurred: false,
          lastAggressor: null,
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
      return {
        ...state,
        hand: {
          ...hand,
          players,
          cardsDealt: hand.cardsDealt + event.deals.length * HOLE_CARDS,
        },
      };
    }

    case "StreetStarted": {
      const hand = asBetting(state);
      const acting = hand.ring.filter((seat) =>
        canStillAct(seatState(hand, seat)),
      );
      const toAct = initialToAct(hand.ring, acting, hand.button, event.street);
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
      const prior = seatState(hand, event.seatId);
      if (event.action === "fold") {
        players.set(event.seatId, { ...prior, folded: true });
      } else if (isAllIn(event.action)) {
        players.set(event.seatId, { ...prior, allIn: true });
      }
      const raiseOccurred = hand.raiseOccurred || reopensBetting(event.action);

      const toAct = reopensBetting(event.action)
        ? requeueAfterRaise(hand.ring, players, event.seatId)
        : hand.toAct.filter((seat) => seat !== event.seatId);

      const lastAggressor = reopensBetting(event.action)
        ? event.seatId
        : hand.lastAggressor;

      return {
        ...state,
        hand: { ...hand, players, raiseOccurred, toAct, lastAggressor },
      };
    }

    case "StreetClosed":
      return state;

    case "BoardDealt": {
      const hand = asBetting(state);
      return {
        ...state,
        hand: {
          ...hand,
          street: event.street,
          board: [...hand.board, ...event.cards],
          cardsDealt: hand.cardsDealt + event.cards.length,
          lastAggressor: null,
        },
      };
    }

    case "CardBurned": {
      const hand = asBetting(state);
      return {
        ...state,
        hand: {
          ...hand,
          burned: [
            ...hand.burned,
            must(event.card, "a burn is only applied with its card"),
          ],
          cardsDealt: hand.cardsDealt + 1,
        },
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
          ...handPositions(hand),
          board: hand.board,
          winner: event.winner,
        },
      };
    }

    case "ShowdownReached": {
      const hand = asBetting(state);
      const contestants: Contestant[] = event.contestants.map((seatId) => {
        const seat = seatState(hand, seatId);
        return {
          seatId,
          holeCards: must(
            seat.holeCards,
            "a live seat at showdown always has hole cards",
          ),
          allIn: seat.allIn,
        };
      });
      return {
        ...state,
        hand: {
          status: "complete",
          reason: "showdown",
          seed: hand.seed,
          button: hand.button,
          ...handPositions(hand),
          board: hand.board,
          contestants,
          lastAggressor: hand.lastAggressor,
          results: [],
          queue: showingOrder(hand.ring, contestants, hand.lastAggressor),
          mucked: [],
          winners: null,
        },
      };
    }

    case "HoleCardsShown": {
      const hand = asAwaitingShowdown(state);
      if (hand.results.some((shown) => shown.seatId === event.result.seatId)) {
        return state;
      }
      return {
        ...state,
        hand: {
          ...hand,
          results: [...hand.results, event.result],
          queue: hand.queue.filter((seat) => seat !== event.result.seatId),
        },
      };
    }

    case "HoleCardsMucked": {
      const hand = asAwaitingShowdown(state);
      if (hand.mucked.includes(event.seatId)) return state;
      return {
        ...state,
        hand: {
          ...hand,
          mucked: [...hand.mucked, event.seatId],
          queue: hand.queue.filter((seat) => seat !== event.seatId),
        },
      };
    }

    case "WinnersDeclared": {
      const hand = asAwaitingShowdown(state);
      return { ...state, hand: { ...hand, winners: event.winners } };
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
