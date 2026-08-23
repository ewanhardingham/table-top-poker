import type {
  Card as CardType,
  SeatView,
  TableView,
} from "@table-top-poker/protocol";
import { Card } from "@table-top-poker/ui-shared";
import { motion, useReducedMotion } from "motion/react";
import { useEffect, useRef } from "react";
import { BurnPile } from "./BurnPile.js";
import { BOARD_CARD_EM, boardKeys, dealBoard } from "./boardDeal.js";
import { streetDealDelay } from "./burnPile.js";
import { seatLabel } from "./seatLabel.js";

export interface BoardProps {
  readonly view: TableView;
  readonly seats?: readonly SeatView[];
}

/**
 * The community cards, with a Motion deal-in for the cards that have just
 * arrived — see `docs/design/board-card-entry.md`. The street waits out the
 * burn that precedes it (#265).
 */
function CommunityCards({ board }: { readonly board: readonly CardType[] }) {
  const reducedMotion = useReducedMotion();
  const dealtBefore = useRef<ReadonlySet<string>>(new Set());
  const dealt = dealBoard(
    board,
    dealtBefore.current,
    streetDealDelay(reducedMotion === true),
  );

  useEffect(() => {
    dealtBefore.current = boardKeys(board);
  });

  return (
    <div
      data-testid="community-cards"
      style={{
        display: "flex",
        gap: "0.4em",
        fontSize: `${String(BOARD_CARD_EM)}em`,
      }}
    >
      {dealt.map(({ card, key, initial, duration, delay }) => (
        <motion.div
          key={key}
          initial={initial}
          animate={{ opacity: 1, y: 0, rotate: 0, scale: 1 }}
          transition={{ duration, delay }}
        >
          <Card rank={card.rank} suit={card.suit} />
        </motion.div>
      ))}
    </div>
  );
}

export function Board({ view, seats = [] }: BoardProps) {
  if (view.phase === "no-hand") {
    return (
      <div data-testid="board" data-phase="no-hand">
        Waiting to deal — button on {seatLabel(view.button, seats)}.
      </div>
    );
  }

  return (
    <div
      data-testid="board"
      data-phase={view.phase}
      data-street={view.phase === "betting" ? view.street : undefined}
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: "0.6em",
      }}
    >
      <div
        style={{
          position: "relative",
          display: "flex",
          justifyContent: "center",
        }}
      >
        <div
          style={{
            position: "absolute",
            right: "100%",
            top: 0,
            marginRight: "1.2em",
          }}
        >
          <BurnPile count={view.burnedCount} />
        </div>
        <CommunityCards board={view.board} />
      </div>
    </div>
  );
}
