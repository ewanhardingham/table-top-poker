import type { SeatView, TableView } from "@table-top-poker/protocol";
import { Card } from "@table-top-poker/ui-shared";

export interface BoardProps {
  readonly view: TableView;
  readonly seats: readonly SeatView[];
}

type SeatStatus = "open" | "sitting-out" | "folded" | "in-hand";

/** The per-seat slice of a betting-phase `TableView`. */
interface HandSeat {
  readonly seatId: number;
  readonly folded: boolean;
}

/**
 * Cross-references the room's full seat list against this hand's dealt-in
 * seats: a claimed seat absent from `handSeats` was excluded from the deal
 * (sitting out), never a leak — `handSeats` only ever lists seats actually
 * dealt into the running hand (docs/phase-1-spec.md §4).
 */
function statusOf(seat: SeatView, handSeats: readonly HandSeat[]): SeatStatus {
  if (!seat.claimed) return "open";
  const handSeat = handSeats.find((s) => s.seatId === seat.id);
  if (!handSeat) return "sitting-out";
  return handSeat.folded ? "folded" : "in-hand";
}

export function Board({ view, seats }: BoardProps) {
  if (view.phase === "no-hand") {
    return (
      <div data-testid="board" data-phase="no-hand">
        Waiting to deal — button on Seat {view.button + 1}.
      </div>
    );
  }

  if (view.phase === "folded-out") {
    return (
      <div data-testid="board" data-phase="folded-out">
        Hand complete — Seat {view.winner + 1} wins, everyone else folded.
      </div>
    );
  }

  if (view.phase === "showdown") {
    return (
      <div data-testid="board" data-phase="showdown">
        <span data-testid="winners">
          Winner{view.winners.length > 1 ? "s" : ""}: seat
          {view.winners.length > 1 ? "s" : ""}{" "}
          {view.winners.map((seatId) => seatId + 1).join(", ")}
        </span>
        <ul data-testid="showdown-results">
          {view.results.map((result) => (
            <li
              key={result.seatId}
              data-testid={`result-${String(result.seatId)}`}
            >
              Seat {result.seatId + 1}: {result.description}
              {result.holeCards.map((card, i) => (
                <Card key={i} rank={card.rank} suit={card.suit} />
              ))}
            </li>
          ))}
        </ul>
      </div>
    );
  }

  const actor = view.toAct[0];

  return (
    <div data-testid="board" data-phase="betting" data-street={view.street}>
      <div data-testid="community-cards">
        {view.board.map((card, i) => (
          <Card key={i} rank={card.rank} suit={card.suit} />
        ))}
      </div>
      <ul data-testid="board-seats">
        {seats.map((seat) => {
          const status = statusOf(seat, view.seats);
          const isButton = seat.id === view.button;
          const isActor = seat.id === actor;
          return (
            <li
              key={seat.id}
              data-testid={`board-seat-${String(seat.id)}`}
              data-status={status}
              data-button={isButton}
              data-turn={isActor}
            >
              Seat {seat.id + 1} — {status}
              {isButton ? " (button)" : ""}
              {isActor ? " (to act)" : ""}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
