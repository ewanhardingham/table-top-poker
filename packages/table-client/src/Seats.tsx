import type { SeatView, TableView } from "@table-top-poker/protocol";
import {
  color,
  font,
  positionMarkerColor,
  positionMarkerFor,
  positionMarkerLabel,
  shadow,
  type PositionMarker,
} from "@table-top-poker/ui-shared";
import { AnimatePresence, motion } from "motion/react";
import { posFor } from "./table/posFor.js";

export interface SeatsProps {
  readonly seats: readonly SeatView[];
  readonly view: TableView | null;
  /** Called with a claimed seat's id when its pod is clicked — table-only, see ADR-0003. */
  readonly onSeatClick?: (seatId: number) => void;
}

type SeatStatus =
  "open" | "sitting-out" | "disconnected" | "folded" | "in-hand";

/**
 * One diameter and one font size for all three markers, resolved against the
 * pod rather than against the marker's own text. The two are set on separate
 * elements on purpose: `width: 1.6em` and `fontSize: 0.6em` on the *same*
 * element made the true diameter `1.6 x 0.6em`, which is why the button
 * marker rendered at roughly a third of the avatar instead of half of it.
 */
const MARKER_DIAMETER = "1.6em";
const MARKER_FONT_SIZE = "0.62em";

interface SeatVisual {
  readonly status: SeatStatus;
  readonly marker: PositionMarker | null;
  readonly isActor: boolean;
  readonly isWinner: boolean;
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
  const showdownResult =
    view?.phase === "showdown"
      ? view.results.find((r) => r.seatId === seat.id)
      : undefined;
  const participatedInCurrentHand =
    view?.phase === "betting"
      ? handSeat !== undefined
      : view?.phase === "showdown"
        ? showdownResult !== undefined
        : view?.phase === "folded-out"
          ? view.winner === seat.id
          : false;

  let status: SeatStatus = "open";
  if (seat.claimed) {
    if (view?.phase === "betting") {
      status = !handSeat
        ? seat.disconnected
          ? "disconnected"
          : "sitting-out"
        : handSeat.folded
          ? "folded"
          : "in-hand";
    } else if (participatedInCurrentHand) {
      // `SeatView.sittingOut` may change during a hand, but the hand view is
      // authoritative about whether this seat is still in that hand.
      status = "in-hand";
    } else {
      status = seat.disconnected
        ? "disconnected"
        : seat.sittingOut
          ? "sitting-out"
          : "in-hand";
    }
  }

  // Showdown no longer marks a winning seat on the felt — the reveal overlay
  // owns who-won (issue #169). Only the fold-out ending still crowns a seat.
  const isWinner =
    view?.phase === "folded-out" ? view.winner === seat.id : false;

  const avatarBackground = !seat.claimed
    ? color.seatAvatarOpen
    : status === "folded"
      ? color.seatAvatarFolded
      : status === "sitting-out"
        ? color.seatAvatarSittingOut
        : color.text;
  const avatarColor = !seat.claimed
    ? color.seatAvatarOpenText
    : status === "folded"
      ? color.seatAvatarFoldedText
      : status === "sitting-out"
        ? color.seatAvatarSittingOutText
        : color.pillInk;

  return {
    status,
    marker: positionMarkerFor(seat.id, view),
    isActor: view?.phase === "betting" && view.toAct[0] === seat.id,
    isWinner,
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
export function Seats({ seats, view, onSeatClick }: SeatsProps) {
  return (
    <div data-testid="seats" style={{ position: "absolute", inset: 0 }}>
      {seats.map((seat) => {
        const visual = deriveSeat(seat, view);
        const pos = posFor(seat.id, seats.length);
        // Bottom-row seats sit at posFor's ~90% and top-row at ~10%. The
        // midline split below decides how a seat's contents are arranged and
        // which way round its writing reads — it never repositions anything
        // posFor already placed.
        const isTopRow = pos.top < 50;
        // One rule, one place: everything a top-row seat writes turns half a
        // revolution so the player at that edge reads it upright. Anything
        // added to a pod later has to carry this too. The callout takes the
        // number rather than the style because motion composes `rotate` into
        // the same transform as its `y` and `scale`, and a CSS `transform`
        // there would simply be overwritten.
        const flipDegrees = isTopRow ? 180 : 0;
        const flipStyle = isTopRow
          ? { transform: `rotate(${String(flipDegrees)}deg)` }
          : undefined;

        const avatarBlock = (
          <div key="avatar" style={{ position: "relative" }}>
            <div
              data-testid={`seat-pod-${String(seat.id)}-avatar`}
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
                border:
                  visual.status === "sitting-out"
                    ? `1px dashed ${color.seatSittingOutBorder}`
                    : undefined,
              }}
            >
              {seat.id + 1}
            </div>
            {visual.status === "sitting-out" && (
              <span
                aria-hidden="true"
                data-testid={`seat-pod-${String(seat.id)}-sitting-out-marker`}
                style={{
                  position: "absolute",
                  left: "0.1em",
                  right: "0.1em",
                  top: "50%",
                  height: "1px",
                  transform: "rotate(-34deg)",
                  background: color.textFaint,
                }}
              />
            )}
            {visual.marker && (
              <span
                data-testid={`seat-pod-${String(seat.id)}-${visual.marker}`}
                style={{
                  position: "absolute",
                  top: "-0.4em",
                  right: "-0.4em",
                  width: MARKER_DIAMETER,
                  height: MARKER_DIAMETER,
                  borderRadius: "50%",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  background: positionMarkerColor[visual.marker],
                  color: color.pillInk,
                  boxShadow: shadow.card,
                }}
              >
                <span
                  style={{
                    fontFamily: font.mono,
                    fontSize: MARKER_FONT_SIZE,
                    fontWeight: 700,
                    lineHeight: 1,
                  }}
                >
                  {positionMarkerLabel[visual.marker]}
                </span>
              </span>
            )}
            {seat.bot === true && (
              <span
                aria-label="Bot"
                data-testid={`seat-pod-${String(seat.id)}-bot-marker`}
                title="Bot"
                style={{
                  position: "absolute",
                  bottom: "-0.4em",
                  left: "-0.4em",
                  width: MARKER_DIAMETER,
                  height: MARKER_DIAMETER,
                  borderRadius: "50%",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  background: color.controlFill,
                  color: color.textBright,
                  boxShadow: shadow.card,
                  fontSize: "0.8em",
                  lineHeight: 1,
                }}
              >
                🤖
              </span>
            )}
          </div>
        );

        const nameBlock = seat.claimed && seat.displayName && (
          <div
            key="name"
            data-testid={`seat-pod-${String(seat.id)}-name`}
            title={seat.displayName}
            style={{
              maxWidth: "8em",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              fontSize: "0.7em",
              fontWeight: 600,
              color: color.textBright,
            }}
          >
            {seat.displayName}
          </div>
        );

        const sittingOutBlock = visual.status === "sitting-out" && (
          <div
            key="sitting-out"
            data-testid={`seat-pod-${String(seat.id)}-sitting-out`}
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: "0.15em",
              whiteSpace: "nowrap",
            }}
          >
            <span
              style={{
                fontFamily: font.mono,
                fontSize: "0.6em",
                fontWeight: 700,
                letterSpacing: "0.16em",
                textTransform: "uppercase",
                color: color.textMuted,
              }}
            >
              {seat.sittingOutReason === "waiting-for-next-hand"
                ? "Waiting for next hand"
                : "Sitting out"}
            </span>
            <span style={{ fontSize: "0.6em", color: color.textFaint }}>
              {seat.sittingOutReason === "waiting-for-next-hand"
                ? "Claimed after the deal"
                : "Until you sit in"}
            </span>
          </div>
        );

        // Every seat is a *placard* (issue #204): the avatar, marker, name and
        // status in one row, avatar first. Both rows are built identically and
        // only the top row is turned half a revolution, so each player reads
        // an identically-shaped seat — avatar on their left, copy to its right
        // — from wherever they are sitting.
        //
        // The row replaced a vertical stack, which trades depth for width: a
        // seat now grows sideways from the anchor `posFor` placed rather than
        // inward toward the felt's centre. That is deliberate. A row is only
        // ever about one avatar tall however long the name, so it stays well
        // clear of the rail behind it and the board in front, and rotation
        // changes no layout box — the anchor and the seat's footprint are
        // exactly what they'd be unrotated.
        const podContent = (
          <div
            data-testid={`seat-pod-${String(seat.id)}-placard`}
            data-flipped={isTopRow}
            style={{
              display: "flex",
              flexDirection: "row",
              alignItems: "center",
              gap: "0.5em",
              ...flipStyle,
            }}
          >
            {avatarBlock}
            {(Boolean(nameBlock) || Boolean(sittingOutBlock)) && (
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "flex-start",
                  gap: "0.25em",
                  minWidth: 0,
                }}
              >
                {nameBlock}
                {sittingOutBlock}
              </div>
            )}
          </div>
        );

        return (
          <div
            key={seat.id}
            data-testid={`seat-pod-${String(seat.id)}`}
            data-status={visual.status}
            data-button={visual.marker === "button"}
            data-small-blind={visual.marker === "small-blind"}
            data-big-blind={visual.marker === "big-blind"}
            data-turn={visual.isActor}
            data-winner={visual.isWinner}
            data-disconnected={seat.disconnected}
            data-bot={seat.bot === true}
            onClick={
              seat.claimed && onSeatClick
                ? () => {
                    onSeatClick(seat.id);
                  }
                : undefined
            }
            style={{
              position: "absolute",
              left: `${String(pos.left)}%`,
              top: `${String(pos.top)}%`,
              transform: "translate(-50%, -50%)",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: "0.5em",
              cursor: seat.claimed && onSeatClick ? "pointer" : undefined,
            }}
          >
            <motion.div
              data-testid={`seat-pod-${String(seat.id)}-surface`}
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
                    : visual.status === "sitting-out"
                      ? color.seatSittingOutBackground
                      : "transparent",
                border: `1px solid ${
                  visual.isWinner
                    ? color.seatWinnerBorder
                    : visual.isActor
                      ? color.accent
                      : visual.status === "sitting-out"
                        ? color.seatSittingOutBorder
                        : "transparent"
                }`,
                opacity:
                  visual.status === "folded"
                    ? 0.34
                    : visual.status === "sitting-out"
                      ? 0.82
                      : 1,
              }}
            >
              {podContent}
            </motion.div>
            <AnimatePresence>
              {visual.isActor && (
                <motion.div
                  data-testid={`seat-pod-${String(seat.id)}-to-act`}
                  data-flipped={isTopRow}
                  // The callout stays a sibling of the placard, keeping its
                  // own inward footprint below the seat; only its own text is
                  // turned for a top-row player. `rotate` rides in the
                  // animated transform so it composes with `y` and `scale`
                  // rather than being overwritten by them.
                  initial={{
                    opacity: 0,
                    y: 6,
                    scale: 0.9,
                    rotate: flipDegrees,
                  }}
                  animate={{ opacity: 1, y: 0, scale: 1, rotate: flipDegrees }}
                  exit={{ opacity: 0, y: 6, scale: 0.9, rotate: flipDegrees }}
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
              <span
                data-testid={`seat-pod-${String(seat.id)}-disconnected`}
                // Same copy either way; a top-row badge just turns with the
                // rest of that seat's writing so one player never reads half
                // their seat upside down.
                style={flipStyle}
              >
                Disconnected
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}
