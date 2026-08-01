import type {
  Card as CardType,
  SeatView,
  TableView,
} from "@table-top-poker/protocol";
import { Card, color, font } from "@table-top-poker/ui-shared";
import { motion } from "motion/react";

export interface BoardProps {
  readonly view: TableView;
  readonly seats?: readonly SeatView[];
}

function seatLabel(seatId: number, seats: readonly SeatView[]): string {
  return (
    seats.find((seat) => seat.id === seatId)?.displayName ??
    `Seat ${String(seatId + 1)}`
  );
}

/** The community cards, dealt in one at a time via Motion rather than CSS keyframes. */
function CommunityCards({ board }: { readonly board: readonly CardType[] }) {
  return (
    <div
      data-testid="community-cards"
      style={{ display: "flex", gap: "0.4em", fontSize: "2.4em" }}
    >
      {board.map((card, i) => (
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
  );
}

/**
 * "Hand complete" pill grouped directly above the community cards — the
 * two move as one unit rather than the banner pinned to the felt's edge
 * independently of the board it's describing. Never says "you" (unlike
 * player-client's identical-looking banner, docs/design decision from
 * issue #63) since the table has no single viewer to address.
 */
function HandCompleteBanner({ text }: { readonly text: string }) {
  return (
    <div
      data-testid="hand-complete-banner"
      style={{
        display: "flex",
        alignItems: "center",
        gap: "0.5em",
        padding: "0.45em 1em",
        borderRadius: "999px",
        background: color.winBackground,
        border: `1px solid ${color.winBorder}`,
        fontSize: "0.9em",
        whiteSpace: "nowrap",
      }}
    >
      <span
        style={{
          width: "0.5em",
          height: "0.5em",
          borderRadius: "50%",
          flex: "none",
          background: color.winBright,
          boxShadow: `0 0 0.5em ${color.winBright}`,
        }}
      />
      <span
        style={{
          fontFamily: font.mono,
          fontSize: "0.65em",
          letterSpacing: "0.16em",
          textTransform: "uppercase",
          color: color.winKicker,
        }}
      >
        Hand complete
      </span>
      <span style={{ color: color.winText, fontWeight: 600 }}>{text}</span>
    </div>
  );
}

/** `winners.join(" & ") wins/split with <description>` — never "everyone folded". */
function showdownText(
  winners: readonly number[],
  description: string | undefined,
  seats: readonly SeatView[],
): string {
  const names = winners.map((winner) => seatLabel(winner, seats)).join(" & ");
  const verb = winners.length > 1 ? "split" : "wins";
  return description ? `${names} ${verb} — ${description}` : `${names} ${verb}`;
}

/**
 * The felt's centre content — community cards and, at showdown, a single
 * "hand complete" line naming the winner(s) and their hand. Each seat's own
 * revealed hole cards live at the seat pod (`Seats`' job), not duplicated
 * here — issue #60's showdown-reveal pass found showing every hand twice
 * (once here, once at the pod) was most of what made the felt unreadable
 * at a full 8-player table.
 */
export function Board({ view, seats = [] }: BoardProps) {
  if (view.phase === "no-hand") {
    return (
      <div data-testid="board" data-phase="no-hand">
        Waiting to deal — button on {seatLabel(view.button, seats)}.
      </div>
    );
  }

  if (view.phase === "folded-out") {
    return (
      <div data-testid="board" data-phase="folded-out">
        <HandCompleteBanner
          text={`${seatLabel(view.winner, seats)} wins — everyone folded`}
        />
      </div>
    );
  }

  if (view.phase === "showdown") {
    const winnerResult = view.results.find((result) =>
      view.winners.includes(result.seatId),
    );
    return (
      <div
        data-testid="board"
        data-phase="showdown"
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: "0.6em",
        }}
      >
        <HandCompleteBanner
          text={showdownText(view.winners, winnerResult?.description, seats)}
        />
        <CommunityCards board={view.board} />
      </div>
    );
  }

  return (
    <div data-testid="board" data-phase="betting" data-street={view.street}>
      <CommunityCards board={view.board} />
    </div>
  );
}
