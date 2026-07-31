import type { Card as CardType, TableView } from "@table-top-poker/protocol";
import { Card, color, font } from "@table-top-poker/ui-shared";
import { motion } from "motion/react";
import { useEffect, useRef } from "react";

export interface BoardProps {
  readonly view: TableView;
}

function seatLabel(seatId: number): string {
  return `Seat ${String(seatId + 1)}`;
}

/**
 * The community cards, dealt in one at a time via Motion rather than CSS
 * keyframes.
 *
 * **Only newly arrived cards animate.** Each card is keyed by its own
 * rank+suit rather than by board position, so a card already on the felt is
 * never remounted and never replays its deal — and the stagger is measured
 * from the first *new* card, so a lone turn card lands immediately instead of
 * waiting out three flop cards' delays. Keying by index made every re-render
 * with a changed board re-deal the whole board, which is invisible in live
 * play (the board only ever grows, one street at a time) but obvious the
 * moment you scrub a replay backwards and forwards (wayfinder #82).
 */
function CommunityCards({ board }: { readonly board: readonly CardType[] }) {
  // How many cards were already on the felt when this render began; anything
  // at or beyond it is arriving now.
  const dealtBefore = useRef(0);
  const alreadyDealt = dealtBefore.current;

  useEffect(() => {
    dealtBefore.current = board.length;
  }, [board.length]);

  return (
    <div
      data-testid="community-cards"
      style={{ display: "flex", gap: "0.4em", fontSize: "2.4em" }}
    >
      {board.map((card, i) => {
        const isNew = i >= alreadyDealt;
        return (
          <motion.div
            key={`${card.rank}${card.suit}`}
            initial={
              isNew ? { opacity: 0, y: -18, rotate: -6, scale: 0.9 } : false
            }
            animate={{ opacity: 1, y: 0, rotate: 0, scale: 1 }}
            transition={{
              duration: isNew ? 0.4 : 0,
              delay: isNew ? (i - alreadyDealt) * 0.08 : 0,
            }}
          >
            <Card rank={card.rank} suit={card.suit} />
          </motion.div>
        );
      })}
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
): string {
  const names = winners.map(seatLabel).join(" & ");
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
export function Board({ view }: BoardProps) {
  if (view.phase === "no-hand") {
    return (
      <div data-testid="board" data-phase="no-hand">
        Waiting to deal — button on Seat {view.button + 1}.
      </div>
    );
  }

  // One shape for every phase that has a hand, so `CommunityCards` keeps its
  // position in the tree as the phase changes. Branching per phase used to
  // return structurally different trees, which remounted the board on the
  // betting → showdown transition and re-dealt all five cards (wayfinder #82).
  const winnerResult =
    view.phase === "showdown"
      ? view.results.find((result) => view.winners.includes(result.seatId))
      : undefined;

  const banner =
    view.phase === "folded-out" ? (
      <HandCompleteBanner
        text={`${seatLabel(view.winner)} wins — everyone folded`}
      />
    ) : view.phase === "showdown" ? (
      <HandCompleteBanner
        text={showdownText(view.winners, winnerResult?.description)}
      />
    ) : null;

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
      {banner}
      {/* A folded-out hand shows no board at all — nobody paid to see it. */}
      {view.phase !== "folded-out" && <CommunityCards board={view.board} />}
    </div>
  );
}
