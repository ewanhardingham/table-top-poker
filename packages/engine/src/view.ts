import { revealedResultFor } from "./evaluate.js";
import { bigBlindSeat, legalActions, smallBlindSeat } from "./table.js";
import type {
  ActionType,
  Card,
  EngineState,
  HandPositions,
  RevealedResult,
  SeatId,
  Street,
} from "./types.js";

/** An all-in Hand turned face-up before the Showdown — see Tabling in `CONTEXT.md`. */
export interface TabledHand {
  readonly seatId: SeatId;
  readonly holeCards: readonly [Card, Card];
}

export interface SeatSnapshot {
  readonly seatId: SeatId;
  readonly folded: boolean;
  readonly allIn: boolean;
}

interface NoHandView {
  readonly phase: "no-hand";
  readonly button: SeatId;
}

interface FoldedOutView extends HandPositions {
  readonly phase: "folded-out";
  readonly board: readonly Card[];
  readonly winner: SeatId;
}

export interface ShowdownView extends HandPositions {
  readonly phase: "showdown";
  readonly turnEndsAt: number | null;
  readonly board: readonly Card[];
  /** Every Seat that reached showdown, shown or not — see ADR-0008. */
  readonly contestants: readonly SeatId[];
  /** Shown Seats only, in the order they were turned over. */
  readonly results: readonly RevealedResult[];
  /** See Showing order in `CONTEXT.md`. */
  readonly queue: readonly SeatId[];
  /** Declined — distinct from a contestant who has simply not shown yet. */
  readonly mucked: readonly SeatId[];
  /** Null until the queue empties: the Hand rests before it resolves. */
  readonly winners: readonly SeatId[] | null;
}

export interface PlayerShowdownView extends ShowdownView {
  readonly yourSeatId: SeatId;
  readonly yourResult: RevealedResult | null;
  readonly canShow: boolean;
  /** Your turn, and some hand is already face-up to discharge the compulsion. */
  readonly canMuck: boolean;
}

export interface PlayerViewBetting extends TableViewBetting {
  readonly yourSeatId: SeatId;
  readonly yourHoleCards: readonly [Card, Card] | null;
  readonly legalActions: readonly ActionType[];
}

export interface TableViewBetting extends HandPositions {
  readonly phase: "betting";
  readonly turnEndsAt: number | null;
  readonly street: Street;
  readonly board: readonly Card[];
  readonly toAct: readonly SeatId[];
  readonly seats: readonly SeatSnapshot[];
  readonly tabled: readonly TabledHand[];
}

export type PlayerView =
  NoHandView | PlayerViewBetting | FoldedOutView | PlayerShowdownView;

export type TableView =
  NoHandView | TableViewBetting | FoldedOutView | ShowdownView;

export function view(
  state: EngineState,
  seatId: SeatId,
  turnEndsAt?: number | null,
): PlayerView;
export function view(
  state: EngineState,
  seatId: "table",
  turnEndsAt?: number | null,
): TableView;
export function view(
  state: EngineState,
  seatId: SeatId | "table",
  turnEndsAt: number | null = null,
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
      burnedCount: hand.burnedCount,
      board: hand.board,
      winner: hand.winner,
    };
  }

  if (hand.status === "complete") {
    const showdownView: ShowdownView = {
      phase: "showdown",
      turnEndsAt,
      button: hand.button,
      smallBlind: hand.smallBlind,
      bigBlind: hand.bigBlind,
      dealtSeatCount: hand.dealtSeatCount,
      burnedCount: hand.burnedCount,
      board: hand.board,
      contestants: hand.contestants.map((contestant) => contestant.seatId),
      results: hand.results,
      queue: hand.queue,
      mucked: hand.mucked,
      winners: hand.winners,
    };
    if (seatId === "table") return showdownView;

    const yours = hand.contestants.find(
      (contestant) => contestant.seatId === seatId,
    );
    const canShow = hand.winners === null && hand.queue[0] === seatId;
    return {
      ...showdownView,
      yourSeatId: seatId,
      yourResult:
        yours === undefined || hand.mucked.includes(seatId)
          ? null
          : revealedResultFor(hand.board, yours),
      canShow,
      canMuck: canShow && hand.results.length > 0,
    };
  }

  const seats: SeatSnapshot[] = [...hand.players].map(([seat, seatState]) => ({
    seatId: seat,
    folded: seatState.folded,
    allIn: seatState.allIn,
  }));

  const tableView: TableViewBetting = {
    phase: "betting",
    turnEndsAt,
    button: hand.button,
    smallBlind: smallBlindSeat(hand.ring, hand.button),
    bigBlind: bigBlindSeat(hand.ring, hand.button),
    dealtSeatCount: hand.ring.length,
    burnedCount: hand.burned.length,
    street: hand.street,
    board: hand.board,
    toAct: hand.toAct,
    seats,
    tabled: hand.tabled.flatMap((seat) => {
      const holeCards = hand.players.get(seat)?.holeCards;
      return holeCards === undefined || holeCards === null
        ? []
        : [{ seatId: seat, holeCards }];
    }),
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
