import { bigBlindSeat, legalActions, smallBlindSeat } from "./table.js";
import type {
  ActionType,
  Card,
  EngineState,
  RevealedResult,
  SeatId,
  Street,
} from "./types.js";

export interface SeatSnapshot {
  readonly seatId: SeatId;
  readonly folded: boolean;
}

/**
 * Between hands there are no blinds: the engine button has already rotated
 * on, so the `button` reported here is a forecast, and the blinds are far
 * likelier than the button to move again before the deal (seats can be
 * claimed, vacated or set to sit out). Deliberately no blind fields.
 */
interface NoHandView {
  readonly phase: "no-hand";
  readonly button: SeatId;
}

/**
 * The positional facts every hand-bearing view carries. `smallBlind` is the
 * engine's honest answer, so heads-up it equals `button` — presentation
 * (which of these to actually draw) is the client's call, not the rules
 * core's. `dealtSeatCount` is how many seats were dealt in, fixed for the
 * hand, so `2` means heads-up in any phase.
 */
interface HandPositions {
  readonly button: SeatId;
  readonly smallBlind: SeatId;
  readonly bigBlind: SeatId;
  readonly dealtSeatCount: number;
}

interface FoldedOutView extends HandPositions {
  readonly phase: "folded-out";
  readonly winner: SeatId;
}

interface ShowdownView extends HandPositions {
  readonly phase: "showdown";
  readonly board: readonly Card[];
  readonly results: readonly RevealedResult[];
  readonly winners: readonly SeatId[];
}

export interface PlayerViewBetting extends HandPositions {
  readonly phase: "betting";
  readonly street: Street;
  readonly board: readonly Card[];
  readonly toAct: readonly SeatId[];
  readonly seats: readonly SeatSnapshot[];
  readonly yourSeatId: SeatId;
  readonly yourHoleCards: readonly [Card, Card] | null;
  /** Empty unless it's `yourSeatId`'s turn — see `legalActions` in table.ts. */
  readonly legalActions: readonly ActionType[];
}

export interface TableViewBetting extends HandPositions {
  readonly phase: "betting";
  readonly street: Street;
  readonly board: readonly Card[];
  readonly toAct: readonly SeatId[];
  readonly seats: readonly SeatSnapshot[];
}

export type PlayerView =
  NoHandView | PlayerViewBetting | FoldedOutView | ShowdownView;

export type TableView =
  NoHandView | TableViewBetting | FoldedOutView | ShowdownView;

/**
 * Builds the restricted view for one seat, or the table device via the
 * `"table"` sentinel. Both are derived from the same authoritative state so
 * the table is never privileged over a player — see Phase 1 spec #130 §4.
 */
export function view(state: EngineState, seatId: SeatId): PlayerView;
export function view(state: EngineState, seatId: "table"): TableView;
export function view(
  state: EngineState,
  seatId: SeatId | "table",
): PlayerView | TableView {
  if (seatId !== "table" && !state.seats.includes(seatId)) {
    throw new Error(`unknown seat ${String(seatId)}`);
  }

  const hand = state.hand;

  if (hand === null) {
    return { phase: "no-hand", button: state.button };
  }

  if (hand.status === "complete" && hand.reason === "folded-out") {
    return {
      phase: "folded-out",
      button: hand.button,
      smallBlind: hand.smallBlind,
      bigBlind: hand.bigBlind,
      dealtSeatCount: hand.dealtSeatCount,
      winner: hand.winner,
    };
  }

  if (hand.status === "complete") {
    return {
      phase: "showdown",
      button: hand.button,
      smallBlind: hand.smallBlind,
      bigBlind: hand.bigBlind,
      dealtSeatCount: hand.dealtSeatCount,
      board: hand.board,
      winners: hand.winners,
      results: hand.results,
    };
  }

  const seats: SeatSnapshot[] = [...hand.players].map(([seat, seatState]) => ({
    seatId: seat,
    folded: seatState.folded,
  }));

  const tableView: TableViewBetting = {
    phase: "betting",
    button: hand.button,
    smallBlind: smallBlindSeat(hand.ring, hand.button),
    bigBlind: bigBlindSeat(hand.ring, hand.button),
    dealtSeatCount: hand.ring.length,
    street: hand.street,
    board: hand.board,
    toAct: hand.toAct,
    seats,
  };

  if (seatId === "table") return tableView;

  const yourState = hand.players.get(seatId);
  const yourHoleCards =
    yourState && !yourState.folded ? yourState.holeCards : null;

  const playerView: PlayerViewBetting = {
    ...tableView,
    yourSeatId: seatId,
    yourHoleCards,
    legalActions: hand.toAct[0] === seatId ? legalActions(hand, seatId) : [],
  };
  return playerView;
}
