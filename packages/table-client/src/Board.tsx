import type { TableView } from "@table-top-poker/protocol";
import { Card, font } from "@table-top-poker/ui-shared";
import { motion } from "motion/react";

export interface BoardProps {
  readonly view: TableView;
}

/**
 * The felt's centre content — community cards and, at showdown, every live
 * seat's revealed hand. Seat pods themselves (including button/actor state
 * and each winner's hole cards) are `Seats`' job, not this component's.
 */
export function Board({ view }: BoardProps) {
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
        <div
          data-testid="community-cards"
          style={{ display: "flex", gap: "0.4em", fontSize: "2em" }}
        >
          {view.board.map((card, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: -18, rotate: -6, scale: 0.9 }}
              animate={{ opacity: 1, y: 0, rotate: 0, scale: 1 }}
              transition={{ duration: 0.4, delay: i * 0.08 }}
            >
              <Card rank={card.rank} suit={card.suit} />
            </motion.div>
          ))}
        </div>
        <span data-testid="winners" style={{ fontFamily: font.display }}>
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
              <div data-testid={`best-hand-${String(result.seatId)}`}>
                {result.bestHand.map((card, i) => (
                  <Card key={i} rank={card.rank} suit={card.suit} />
                ))}
              </div>
            </li>
          ))}
        </ul>
      </div>
    );
  }

  return (
    <div data-testid="board" data-phase="betting" data-street={view.street}>
      <div
        data-testid="community-cards"
        style={{ display: "flex", gap: "0.4em", fontSize: "2em" }}
      >
        {view.board.map((card, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, y: -18, rotate: -6, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, rotate: 0, scale: 1 }}
            transition={{ duration: 0.4, delay: i * 0.08 }}
          >
            <Card rank={card.rank} suit={card.suit} />
          </motion.div>
        ))}
      </div>
    </div>
  );
}
