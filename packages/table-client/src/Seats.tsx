import type { SeatView, TableView } from "@table-top-poker/protocol";
import { color, font, shadow } from "@table-top-poker/ui-shared";
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

/** Which positional marker a seat carries, if any. Never more than one. */
type SeatMarker = "button" | "small-blind" | "big-blind";

/**
 * One diameter and one font size for all three markers, resolved against the
 * pod rather than against the marker's own text. The two are set on separate
 * elements on purpose: `width: 1.6em` and `fontSize: 0.6em` on the *same*
 * element made the true diameter `1.6 x 0.6em`, which is why the button
 * marker rendered at roughly a third of the avatar instead of half of it.
 */
const MARKER_DIAMETER = "1.6em";
const MARKER_FONT_SIZE = "0.62em";

const markerLabel: Record<SeatMarker, string> = {
  button: "D",
  "small-blind": "SB",
  "big-blind": "BB",
};

const markerBackground: Record<SeatMarker, string> = {
  button: color.buttonMarker,
  "small-blind": color.blindSmallMarker,
  "big-blind": color.blindBigMarker,
};

interface SeatVisual {
  readonly status: SeatStatus;
  readonly marker: SeatMarker | null;
  readonly isActor: boolean;
  readonly isWinner: boolean;
  readonly avatarBackground: string;
  readonly avatarColor: string;
}

/**
 * Which marker this seat carries. All three come off the same view, so the
 * trio always moves on one tick and no seat ever carries two.
 *
 * Two suppressions, both deliberate:
 *
 * - Between hands (`no-hand`) only the button shows. The engine reports no
 *   blinds without a hand, and the button it does report is already a
 *   forecast of the next deal.
 * - **Heads-up (`dealtSeatCount === 2`) only the button shows — no `SB` on
 *   the button seat, and no `BB` on the other seat either.** The engine
 *   honestly reports `smallBlind === button` heads-up (the button does post
 *   the small blind), which would put two markers on one seat. Rather than
 *   stack or combine them, a heads-up hand reverts to exactly the display
 *   that existed before blind markers were added. This is a decision
 *   (issue #160, decision 4), not an oversight.
 */
function markerFor(seatId: number, view: TableView | null): SeatMarker | null {
  if (view === null) return null;
  // Heads-up is a property of the deal, not of who is still live: folds never
  // change it, so this reads the same in every phase of the hand.
  const headsUp = view.phase !== "no-hand" && view.dealtSeatCount === 2;
  if (view.phase === "no-hand" || headsUp) {
    return seatId === view.button ? "button" : null;
  }
  if (seatId === view.button) return "button";
  if (seatId === view.smallBlind) return "small-blind";
  if (seatId === view.bigBlind) return "big-blind";
  return null;
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
    marker: markerFor(seat.id, view),
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
        // Bottom-row seats sit at posFor's ~90% and top-row at ~10% — the
        // midline split below is only ever used to pick a stacking
        // direction, not to reposition anything posFor already placed.
        const isTopRow = pos.top < 50;

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
                  background: markerBackground[visual.marker],
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
                  {markerLabel[visual.marker]}
                </span>
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

        // Boundary rule: the avatar is the fixed anchor `posFor` placed — the
        // name and status only ever grow inward, toward the felt's centre,
        // never past the seat toward the rail. Top row reads avatar → name →
        // status top to bottom; bottom row is the mirror, so the name and
        // status always end up on the table-facing side, closest to the centre
        // everyone's looking at.
        const stack = isTopRow
          ? [avatarBlock, nameBlock, sittingOutBlock]
          : [sittingOutBlock, nameBlock, avatarBlock];

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
              {stack}
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
