import type {
  Card as CardType,
  SeatView,
  TableView,
} from "@table-top-poker/protocol";
import { Card, color, font, shadow } from "@table-top-poker/ui-shared";
import { AnimatePresence, motion } from "motion/react";
import { posFor } from "./table/posFor.js";

export interface SeatsProps {
  readonly seats: readonly SeatView[];
  readonly view: TableView | null;
}

type SeatStatus = "open" | "sitting-out" | "folded" | "in-hand";

interface SeatVisual {
  readonly status: SeatStatus;
  readonly isButton: boolean;
  readonly isActor: boolean;
  readonly isWinner: boolean;
  readonly holeCards: readonly [CardType, CardType] | null;
  readonly avatarBackground: string;
  readonly avatarColor: string;
}

/**
 * Merges one seat's static room membership with whatever the in-progress
 * `view` knows about it — the single place `Seats` reasons about `TableView`'s
 * per-phase shape, so the render below stays a plain lookup.
 */
function deriveSeat(seat: SeatView, view: TableView | null): SeatVisual {
  const handSeat =
    view?.phase === "betting"
      ? view.seats.find((s) => s.seatId === seat.id)
      : undefined;

  let status: SeatStatus = "open";
  if (seat.claimed) {
    if (view?.phase === "betting") {
      status = !handSeat
        ? "sitting-out"
        : handSeat.folded
          ? "folded"
          : "in-hand";
    } else {
      status = seat.sittingOut ? "sitting-out" : "in-hand";
    }
  }

  const isWinner =
    view?.phase === "showdown"
      ? view.winners.includes(seat.id)
      : view?.phase === "folded-out"
        ? view.winner === seat.id
        : false;

  const avatarBackground = !seat.claimed
    ? color.seatAvatarOpen
    : status === "folded"
      ? color.seatAvatarFolded
      : color.text;
  const avatarColor = !seat.claimed
    ? color.seatAvatarOpenText
    : status === "folded"
      ? color.seatAvatarFoldedText
      : color.pillInk;

  return {
    status,
    isButton: view !== null && seat.id === view.button,
    isActor: view?.phase === "betting" && view.toAct[0] === seat.id,
    isWinner,
    holeCards:
      view?.phase === "showdown"
        ? (view.results.find((r) => r.seatId === seat.id)?.holeCards ?? null)
        : null,
    avatarBackground,
    avatarColor,
  };
}

/**
 * The seat pods ringing the felt's two long edges, percentage-positioned via
 * `posFor` so the layout holds across the table device's real viewport. This
 * is the only place `seats` and the in-progress `view` are merged into a
 * single per-seat picture — `Board` only ever renders the centre content.
 */
export function Seats({ seats, view }: SeatsProps) {
  return (
    <div data-testid="seats" style={{ position: "absolute", inset: 0 }}>
      {seats.map((seat) => {
        const visual = deriveSeat(seat, view);
        const pos = posFor(seat.id, seats.length);

        return (
          <div
            key={seat.id}
            data-testid={`seat-pod-${String(seat.id)}`}
            data-status={visual.status}
            data-button={visual.isButton}
            data-turn={visual.isActor}
            data-winner={visual.isWinner}
            data-disconnected={seat.disconnected}
            style={{
              position: "absolute",
              left: `${String(pos.left)}%`,
              top: `${String(pos.top)}%`,
              transform: "translate(-50%, -50%)",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: "0.5em",
            }}
          >
            <motion.div
              animate={{
                boxShadow: visual.isActor
                  ? [...shadow.seatActorGlow]
                  : shadow.seatResting,
              }}
              transition={
                visual.isActor
                  ? { duration: 1.7, repeat: Infinity, ease: "easeInOut" }
                  : { duration: 0.3 }
              }
              style={{
                position: "relative",
                borderRadius: "1em",
                padding: "0.5em",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: "0.4em",
                background: visual.isWinner
                  ? color.seatWinnerBackground
                  : visual.isActor
                    ? color.seatActorBackground
                    : "transparent",
                border: `1px solid ${
                  visual.isWinner
                    ? color.seatWinnerBorder
                    : visual.isActor
                      ? color.accent
                      : "transparent"
                }`,
                opacity: visual.status === "folded" ? 0.34 : 1,
              }}
            >
              <div
                style={{
                  width: "3em",
                  height: "3em",
                  borderRadius: "50%",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontFamily: font.display,
                  fontWeight: 800,
                  fontSize: "1.1em",
                  background: visual.avatarBackground,
                  color: visual.avatarColor,
                }}
              >
                {seat.id + 1}
              </div>
              {visual.isButton && (
                <span
                  data-testid={`seat-pod-${String(seat.id)}-button`}
                  style={{
                    position: "absolute",
                    top: "-0.4em",
                    right: "-0.4em",
                    width: "1.6em",
                    height: "1.6em",
                    borderRadius: "50%",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontFamily: font.mono,
                    fontSize: "0.6em",
                    fontWeight: 700,
                    background: color.buttonMarker,
                    color: color.pillInk,
                    boxShadow: shadow.card,
                  }}
                >
                  D
                </span>
              )}
              {visual.holeCards && (
                <div
                  data-testid={`seat-pod-${String(seat.id)}-hole-cards`}
                  style={{ display: "flex", gap: "0.2em", fontSize: "0.5em" }}
                >
                  {visual.holeCards.map((c, i) => (
                    <motion.div
                      key={i}
                      initial={{ opacity: 0, rotateY: -92 }}
                      animate={{ opacity: 1, rotateY: 0 }}
                      transition={{ duration: 0.35, delay: i * 0.08 }}
                    >
                      <Card rank={c.rank} suit={c.suit} />
                    </motion.div>
                  ))}
                </div>
              )}
            </motion.div>
            <AnimatePresence>
              {visual.isActor && (
                <motion.div
                  data-testid={`seat-pod-${String(seat.id)}-to-act`}
                  initial={{ opacity: 0, y: 6, scale: 0.9 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 6, scale: 0.9 }}
                  transition={{ duration: 0.2 }}
                  style={{
                    padding: "0.35em 0.9em",
                    borderRadius: "999px",
                    background: color.accent,
                    color: "#fff",
                    fontFamily: font.mono,
                    fontSize: "0.7em",
                    fontWeight: 700,
                    letterSpacing: "0.2em",
                    textTransform: "uppercase",
                    whiteSpace: "nowrap",
                  }}
                >
                  To act
                </motion.div>
              )}
            </AnimatePresence>
            {seat.disconnected && (
              <span data-testid={`seat-pod-${String(seat.id)}-disconnected`}>
                Disconnected
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}
