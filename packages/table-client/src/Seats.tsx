import type {
  Card as CardType,
  SeatView,
  TableView,
} from "@table-top-poker/protocol";
import { Card, color, font } from "@table-top-poker/ui-shared";
import { AnimatePresence, motion } from "motion/react";
import { posFor } from "./table/posFor.js";

export interface SeatsProps {
  readonly seats: readonly SeatView[];
  readonly view: TableView | null;
}

type SeatStatus = "open" | "sitting-out" | "folded" | "in-hand";

function statusOf(seat: SeatView, view: TableView | null): SeatStatus {
  if (!seat.claimed) return "open";
  if (view !== null && view.phase === "betting") {
    const handSeat = view.seats.find((s) => s.seatId === seat.id);
    if (!handSeat) return "sitting-out";
    return handSeat.folded ? "folded" : "in-hand";
  }
  return seat.sittingOut ? "sitting-out" : "in-hand";
}

function isWinnerSeat(seatId: number, view: TableView | null): boolean {
  if (view === null) return false;
  if (view.phase === "showdown") return view.winners.includes(seatId);
  if (view.phase === "folded-out") return view.winner === seatId;
  return false;
}

function holeCardsFor(
  seatId: number,
  view: TableView | null,
): readonly [CardType, CardType] | null {
  if (view?.phase !== "showdown") return null;
  return view.results.find((r) => r.seatId === seatId)?.holeCards ?? null;
}

const restingGlow = "0 0 0 1px rgba(255,255,255,.1)";
const actorGlowFrames = [
  "0 0 0 2px rgba(229,68,60,.95), 0 0 34px 6px rgba(229,68,60,.3)",
  "0 0 0 3px rgba(255,120,110,1), 0 0 54px 14px rgba(229,68,60,.5)",
  "0 0 0 2px rgba(229,68,60,.95), 0 0 34px 6px rgba(229,68,60,.3)",
];

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
        const status = statusOf(seat, view);
        const isButton = view !== null && seat.id === view.button;
        const isActor =
          view !== null &&
          view.phase === "betting" &&
          view.toAct[0] === seat.id;
        const isWinner = isWinnerSeat(seat.id, view);
        const holeCards = holeCardsFor(seat.id, view);
        const pos = posFor(seat.id, seats.length);

        let avatarBackground = "rgba(255,255,255,.06)";
        let avatarColor = "rgba(250,240,238,.5)";
        if (seat.claimed) {
          avatarBackground = color.text;
          avatarColor = color.pillInk;
        }
        if (status === "folded") {
          avatarBackground = "rgba(255,255,255,.1)";
          avatarColor = "rgba(250,240,238,.45)";
        }

        return (
          <div
            key={seat.id}
            data-testid={`seat-pod-${String(seat.id)}`}
            data-status={status}
            data-button={isButton}
            data-turn={isActor}
            data-winner={isWinner}
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
              animate={{ boxShadow: isActor ? actorGlowFrames : restingGlow }}
              transition={
                isActor
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
                background: isWinner
                  ? "rgba(250,234,231,.14)"
                  : isActor
                    ? "rgba(20,7,8,.72)"
                    : "transparent",
                border: `1px solid ${
                  isWinner
                    ? "rgba(250,234,231,.7)"
                    : isActor
                      ? "rgba(229,68,60,.95)"
                      : "transparent"
                }`,
                opacity: status === "folded" ? 0.34 : 1,
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
                  background: avatarBackground,
                  color: avatarColor,
                }}
              >
                {seat.id + 1}
              </div>
              {isButton && (
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
                    background: "#faf6f0",
                    color: color.pillInk,
                    boxShadow: "0 6px 16px -4px rgba(0,0,0,.85)",
                  }}
                >
                  D
                </span>
              )}
              {holeCards && (
                <div
                  data-testid={`seat-pod-${String(seat.id)}-hole-cards`}
                  style={{ display: "flex", gap: "0.2em", fontSize: "0.5em" }}
                >
                  {holeCards.map((c, i) => (
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
              {isActor && (
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
