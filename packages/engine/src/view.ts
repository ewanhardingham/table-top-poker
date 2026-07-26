import type {
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

interface NoHandView {
  readonly phase: "no-hand";
  readonly button: SeatId;
}

interface FoldedOutView {
  readonly phase: "folded-out";
  readonly button: SeatId;
  readonly winner: SeatId;
}

interface ShowdownView {
  readonly phase: "showdown";
  readonly button: SeatId;
  readonly results: readonly RevealedResult[];
  readonly winners: readonly SeatId[];
}

export interface PlayerViewBetting {
  readonly phase: "betting";
  readonly button: SeatId;
  readonly street: Street;
  readonly board: readonly Card[];
  readonly toAct: readonly SeatId[];
  readonly seats: readonly SeatSnapshot[];
  readonly yourSeatId: SeatId;
  readonly yourHoleCards: readonly [Card, Card] | null;
}

export interface TableViewBetting {
  readonly phase: "betting";
  readonly button: SeatId;
  readonly street: Street;
  readonly board: readonly Card[];
  readonly toAct: readonly SeatId[];
  readonly seats: readonly SeatSnapshot[];
}

export type PlayerView =
  | NoHandView
  | PlayerViewBetting
  | FoldedOutView
  | ShowdownView;

export type TableView =
  | NoHandView
  | TableViewBetting
  | FoldedOutView
  | ShowdownView;

/**
 * Builds the restricted view for one seat, or the table device via the
 * `"table"` sentinel. Both are derived from the same authoritative state so
 * the table is never privileged over a player — see docs/phase-1-spec.md §4.
 */
export function view(state: EngineState, seatId: SeatId): PlayerView;
export function view(state: EngineState, seatId: "table"): TableView;
export function view(
  state: EngineState,
  seatId: SeatId | "table",
): PlayerView | TableView {
  const hand = state.hand;

  if (hand === null) {
    return { phase: "no-hand", button: state.button };
  }

  if (hand.status === "complete" && hand.reason === "folded-out") {
    return { phase: "folded-out", button: hand.button, winner: hand.winner };
  }

  if (hand.status === "complete" && hand.reason === "showdown") {
    return {
      phase: "showdown",
      button: hand.button,
      winners: hand.winners,
      results: hand.results,
    };
  }

  const seats: SeatSnapshot[] = [...hand.players].map(
    ([seat, seatState]) => ({ seatId: seat, folded: seatState.folded }),
  );

  const tableView: TableViewBetting = {
    phase: "betting",
    button: hand.button,
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
  };
  return playerView;
}
