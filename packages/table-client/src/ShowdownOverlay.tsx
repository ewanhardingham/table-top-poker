import type {
  Card as CardType,
  RevealedResult,
  SeatView,
  TableView,
} from "@table-top-poker/protocol";
import { Card, color, font } from "@table-top-poker/ui-shared";
import { AnimatePresence, motion } from "motion/react";
import { useLayoutEffect, useRef, useState } from "react";
import { seatLabel } from "./seatLabel.js";

/**
 * The burger (settings) toggle lives in the top-right of the felt at
 * `top:20 right:24`, 52px square. The overlay reserves this much clearance at
 * the top so its panel never creeps under it. Kept in sync with
 * `SettingsToggle`.
 */
const BURGER_CLEARANCE = "5.25rem";

/**
 * Uniformly scales the measured content down until it fits inside the stage's
 * padding box, so every element shrinks together rather than the panel
 * clipping its own overflow. `offset*`/`client*` sizes are layout sizes and
 * ignore CSS transforms, so applying the returned scale never feeds back into
 * the measurement — no observer loop. Only ever scales down (never past 1).
 */
function useFitToBox() {
  const stageRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);

  useLayoutEffect(() => {
    const stage = stageRef.current;
    const content = contentRef.current;
    if (stage === null || content === null) return;

    function measure(): void {
      if (stage === null || content === null) return;
      const styles = getComputedStyle(stage);
      const padX =
        parseFloat(styles.paddingLeft) + parseFloat(styles.paddingRight);
      const padY =
        parseFloat(styles.paddingTop) + parseFloat(styles.paddingBottom);
      const availWidth = stage.clientWidth - padX;
      const availHeight = stage.clientHeight - padY;
      const naturalWidth = content.offsetWidth;
      const naturalHeight = content.offsetHeight;
      if (naturalWidth === 0 || naturalHeight === 0) return;
      setScale(
        Math.min(1, availWidth / naturalWidth, availHeight / naturalHeight),
      );
    }

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(stage);
    observer.observe(content);
    return () => {
      observer.disconnect();
    };
  }, []);

  return { stageRef, contentRef, scale };
}

/** The showdown shape of the table view — the only phase this overlay renders. */
type ShowdownView = Extract<TableView, { phase: "showdown" }>;

export interface ShowdownOverlayProps {
  readonly view: ShowdownView;
  readonly seats: readonly SeatView[];
  /**
   * `true` once "View table" is pressed: the overlay animates out so the felt
   * and its controls are reachable, and the rail's "View showdown" button
   * brings it back. Reset to `false` on each new showdown by the caller, so
   * every hand opens featured.
   */
  readonly collapsed: boolean;
  /**
   * Whether enough players are dealt in for the server to accept `nextHand` —
   * mirrors the rail's own gate. False disables "Next hand" with a reason
   * rather than dealing into a rejection.
   */
  readonly canDealNextHand: boolean;
  readonly onNextHand: () => void;
  readonly onViewTable: () => void;
}

/** A row of face-up cards at a given em scale. */
function CardRow({
  cards,
  scale,
  gap = "0.28em",
}: {
  readonly cards: readonly CardType[];
  readonly scale: string;
  readonly gap?: string;
}) {
  return (
    <div style={{ display: "flex", gap, fontSize: scale }}>
      {cards.map((card, i) => (
        <Card key={i} rank={card.rank} suit={card.suit} />
      ))}
    </div>
  );
}

/** The community cards, labelled, at the top of the overlay. */
function BoardStrip({ board }: { readonly board: readonly CardType[] }) {
  return (
    <div
      data-testid="showdown-board"
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: "clamp(0.35rem, 1vh, 0.6rem)",
      }}
    >
      <span
        style={{
          fontFamily: font.mono,
          fontSize: "0.75rem",
          letterSpacing: "0.28em",
          color: color.textMuted,
        }}
      >
        BOARD
      </span>
      <CardRow cards={board} scale="min(1.5rem, 2.2vh)" gap="0.4em" />
    </div>
  );
}

/**
 * One revealed seat: cards, name, and hand description. Winners glow (a gentle
 * pulse via `.showdown-win-glow`) and, when `featured`, render larger so the
 * result reads at a glance across the table.
 */
function OverlayPlayer({
  result,
  name,
  isWinner,
  featured = false,
}: {
  readonly result: RevealedResult;
  readonly name: string;
  readonly isWinner: boolean;
  readonly featured?: boolean;
}) {
  return (
    <div
      data-testid={`showdown-player-${String(result.seatId)}`}
      data-winner={isWinner}
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: "clamp(0.35rem, 1vh, 0.7rem)",
      }}
    >
      <div
        className={isWinner ? "showdown-win-glow" : undefined}
        style={{
          padding: featured ? "0.5rem" : "0.4rem",
          borderRadius: "0.6rem",
          border: `1px solid ${isWinner ? color.winBorder : "transparent"}`,
          background: isWinner ? color.winPlate : undefined,
        }}
      >
        <CardRow
          cards={result.holeCards}
          scale={featured ? "min(2.1rem, 3vh)" : "min(1.2rem, 1.8vh)"}
        />
      </div>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: "0.2rem",
          textAlign: "center",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "baseline",
            gap: "0.5em",
            fontSize: featured ? "1.3rem" : "1rem",
            fontWeight: 700,
            color: isWinner ? color.winText : color.text,
          }}
        >
          {name}
          {isWinner && (
            <span
              style={{
                fontFamily: font.mono,
                fontSize: "0.6em",
                letterSpacing: "0.16em",
                color: color.winBright,
              }}
            >
              WINS
            </span>
          )}
        </div>
        <div
          style={{
            fontFamily: font.mono,
            fontSize: featured ? "0.85rem" : "0.72rem",
            letterSpacing: "0.02em",
            color: isWinner ? color.winBright : color.textDim,
          }}
        >
          {result.description}
        </div>
      </div>
    </div>
  );
}

function OverlayButtons({
  canDealNextHand,
  onNextHand,
  onViewTable,
}: {
  readonly canDealNextHand: boolean;
  readonly onNextHand: () => void;
  readonly onViewTable: () => void;
}) {
  return (
    <div
      style={{
        marginTop: "0.4rem",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: "0.5rem",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "1rem",
        }}
      >
        <button
          type="button"
          data-testid="showdown-view-table-button"
          onClick={onViewTable}
          style={{
            padding: "0.7rem 2.2rem",
            borderRadius: "999px",
            border: `1px solid ${color.borderStrong}`,
            cursor: "pointer",
            background: "transparent",
            color: color.textMuted,
            fontFamily: font.display,
            fontSize: "1rem",
            fontWeight: 800,
            letterSpacing: "0.04em",
          }}
        >
          View table
        </button>
        <button
          type="button"
          data-testid="showdown-next-hand-button"
          disabled={!canDealNextHand}
          onClick={onNextHand}
          style={{
            padding: "0.7rem 2.2rem",
            borderRadius: "999px",
            border: "none",
            cursor: canDealNextHand ? "pointer" : "not-allowed",
            background: color.pillGradient,
            color: color.pillInk,
            fontFamily: font.display,
            fontSize: "1rem",
            fontWeight: 800,
            letterSpacing: "0.04em",
            opacity: canDealNextHand ? 1 : 0.5,
            boxShadow:
              "0 16px 40px -14px rgba(229,68,60,.6), inset 0 1px 0 rgba(255,255,255,.5)",
          }}
        >
          Next hand →
        </button>
      </div>
      {!canDealNextHand && (
        <div
          data-testid="showdown-next-hand-blocked-hint"
          style={{ fontSize: "0.8rem", color: color.textDim }}
        >
          Waiting for at least two players
        </div>
      )}
    </div>
  );
}

/**
 * The showdown reveal: a single centred panel over a dimmed felt (issue #169,
 * prototype variant E). It shows the board, every seat that reached showdown as
 * name + cards + hand description, and the winner(s) featured larger with a
 * pulsing green glow. It supersedes the per-seat reveal and the felt's winner
 * mark — who won lives only here.
 *
 * "View table" animates the panel out so the felt's own controls (house rules,
 * end session, join QR) are reachable; the rail's "View showdown" button brings
 * it back. The panel always fits its bounding box — content scales to the
 * viewport and never scrolls, heads-up or full ring.
 */
export function ShowdownOverlay({
  view,
  seats,
  collapsed,
  canDealNextHand,
  onNextHand,
  onViewTable,
}: ShowdownOverlayProps) {
  const winnerIds = new Set(view.winners);
  const winners = view.results.filter((result) => winnerIds.has(result.seatId));
  const rest = view.results.filter((result) => !winnerIds.has(result.seatId));
  const { stageRef, contentRef, scale } = useFitToBox();

  return (
    <AnimatePresence>
      {!collapsed && (
        <motion.div
          ref={stageRef}
          key="overlay"
          data-testid="showdown-overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "rgba(5,4,4,.6)",
            backdropFilter: "blur(2px)",
            padding: "1.5rem",
            // Keep the panel out from under the top-right burger menu.
            paddingTop: BURGER_CLEARANCE,
          }}
        >
          <div
            ref={contentRef}
            style={{
              width: "min(97%, 92rem)",
              flexShrink: 0,
              transform: `scale(${String(scale)})`,
              transformOrigin: "center center",
            }}
          >
          <motion.div
            initial={{ scale: 0.96, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.96, opacity: 0 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            style={{
              width: "100%",
              padding: "clamp(1rem, 2.4vh, 1.8rem)",
              borderRadius: "1.2rem",
              background: color.surfaceGradient,
              border: `1px solid ${color.borderStrong}`,
              boxShadow: "0 44px 90px -30px rgba(0,0,0,.95)",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: "clamp(0.6rem, 1.6vh, 1.4rem)",
            }}
          >
            <span
              style={{
                fontFamily: font.display,
                fontSize: "clamp(1rem, 2.2vh, 1.3rem)",
                fontWeight: 800,
                letterSpacing: "0.06em",
                color: color.text,
              }}
            >
              Showdown
            </span>

            <BoardStrip board={view.board} />

            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                justifyContent: "center",
                gap: "clamp(1rem, 3vw, 2.4rem)",
              }}
            >
              {winners.map((result) => (
                <OverlayPlayer
                  key={result.seatId}
                  result={result}
                  name={seatLabel(result.seatId, seats)}
                  isWinner
                  featured
                />
              ))}
            </div>

            {rest.length > 0 && (
              <>
                <div
                  style={{ width: "100%", height: 1, background: color.border }}
                />
                <div
                  style={{
                    display: "flex",
                    flexWrap: "wrap",
                    justifyContent: "center",
                    gap: "clamp(0.8rem, 2vw, 1.8rem)",
                  }}
                >
                  {rest.map((result) => (
                    <OverlayPlayer
                      key={result.seatId}
                      result={result}
                      name={seatLabel(result.seatId, seats)}
                      isWinner={false}
                    />
                  ))}
                </div>
              </>
            )}

            <OverlayButtons
              canDealNextHand={canDealNextHand}
              onNextHand={onNextHand}
              onViewTable={onViewTable}
            />
          </motion.div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
