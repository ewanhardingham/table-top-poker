import type {
  ActionType,
  RevealedResult,
  SeatId,
  SeatView,
  TableView,
} from "@table-top-poker/protocol";
import {
  Card,
  color,
  font,
  positionMarkerColor,
  positionMarkerFor,
  positionMarkerLabel,
  ShotClock,
  shadow,
  type PositionMarker,
} from "@table-top-poker/ui-shared";
import { AnimatePresence, motion } from "motion/react";
import { actionVerb, type SeatActionLabels } from "./actionWords.js";
import { posFor } from "./table/posFor.js";

export interface SeatsProps {
  readonly seats: readonly SeatView[];
  readonly view: TableView | null;
  readonly shotClockSeconds?: number;
  readonly onSeatClick?: (seatId: number) => void;
  readonly actionLabels?: SeatActionLabels;
}

const slotPillStyle = {
  padding: "0.35em 0.9em",
  borderRadius: "999px",
  fontFamily: font.mono,
  fontSize: "0.7em",
  fontWeight: 700,
  letterSpacing: "0.2em",
  textTransform: "uppercase",
  whiteSpace: "nowrap",
};

function slotMotion(flipDegrees: number) {
  return {
    initial: { opacity: 0, y: 6, scale: 0.9, rotate: flipDegrees },
    animate: { opacity: 1, y: 0, scale: 1, rotate: flipDegrees },
    exit: { opacity: 0, y: 6, scale: 0.9, rotate: flipDegrees },
    transition: { duration: 0.2 },
  };
}

/** See Action label in `CONTEXT.md` for why raise is not accent red. */
const actionTone: Record<
  ActionType,
  { readonly background: string; readonly ink: string }
> = {
  fold: { background: color.actionPassive, ink: color.textDim },
  check: { background: color.actionPassive, ink: color.textMuted },
  call: { background: color.actionCall, ink: "#fff" },
  raise: { background: color.actionRaise, ink: color.pillInk },
  allInCall: { background: color.actionCall, ink: "#fff" },
  allInRaise: { background: color.actionRaise, ink: color.pillInk },
};

type SeatStatus =
  "open" | "sitting-out" | "disconnected" | "folded" | "in-hand";

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

/** Sized off the Seat plate the fan tucks behind, which is the size container. */
const FAN_SCALE = "12.5cqw";
const FAN_WIDTH = "6.26em";
const FAN_HEIGHT = "5.6em";

/**
 * The fan's near edge sits this far inside the plate, measured off the plate so
 * it can never fall below it. At FAN_SCALE the plate is about half a card tall,
 * so what clears it is the readable top half.
 */
const FAN_TUCK = "8%";

interface ShowdownSeat {
  readonly hand: RevealedResult | null;
  readonly isWinner: boolean;
  readonly splitting: boolean;
}

function showdownSeats(view: TableView | null): Map<SeatId, ShowdownSeat> {
  const bySeat = new Map<SeatId, ShowdownSeat>();
  if (view?.phase !== "showdown") return bySeat;

  const winners = view.winners ?? [];
  const shown = new Map(
    view.results.map((result) => [result.seatId, result] as const),
  );
  for (const seatId of view.contestants) {
    bySeat.set(seatId, {
      hand: shown.get(seatId) ?? null,
      isWinner: winners.includes(seatId) && shown.has(seatId),
      splitting: winners.length > 1,
    });
  }
  return bySeat;
}
/**
 * The Hand a Seat made is never spelled out and never placed — the cards are
 * the result and the room reads them. Only the outcome is the engine's to say,
 * and only once the Seat's cards are public to say it over (#253).
 */
function outcomeOf(showdown: ShowdownSeat): string | null {
  if (!showdown.isWinner) return null;
  return showdown.splitting ? "splits" : "wins";
}

/**
 * The outcome rides the Seat plate rather than the cards: a chip laid over a
 * tabled Hand covers the corner index that has to stay readable.
 */
function ShowdownBadges({
  seatId,
  showdown,
  isTopRow,
}: {
  readonly seatId: SeatId;
  readonly showdown: ShowdownSeat;
  readonly isTopRow: boolean;
}) {
  const testId = `seat-pod-${String(seatId)}-showdown`;
  const outcome = outcomeOf(showdown);
  if (outcome === null) return null;

  return (
    <div
      data-testid={`${testId}-badges`}
      data-flipped={isTopRow}
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "stretch",
        gap: "0.3em",
        transform: isTopRow ? "rotate(180deg)" : undefined,
      }}
    >
      <span
        data-testid={`${testId}-verdict`}
        style={{
          flex: "none",
          padding: "0.2em 0.5em",
          borderRadius: "999px",
          fontFamily: font.mono,
          fontSize: "0.58rem",
          fontWeight: 700,
          letterSpacing: "0.12em",
          textTransform: "uppercase",
          whiteSpace: "nowrap",
          lineHeight: 1.35,
          textAlign: "center",
          background: color.winPlate,
          border: `1px solid ${color.winBorder}`,
          color: color.winBright,
        }}
      >
        {outcome}
      </span>
    </div>
  );
}

/**
 * The Hand fans out of the plate on the table-centre side, its near edge tucked
 * behind the Seat so only the readable end of the cards shows. A contestant who
 * has not shown fans two backs while the window is open, and lays nothing down
 * once the Hand closes — a muck keeps nothing.
 *
 * Which half clears the plate decides the stacking: the bottom row shows the
 * cards' top corner indices, the top row their mirrored bottom ones, so the
 * overlap has to fall the other way round or it buries the under card's only
 * index.
 */
function ShowdownHand({
  seatId,
  hand,
  isWinner,
  isTopRow,
}: {
  readonly seatId: SeatId;
  readonly hand: RevealedResult | null;
  readonly isWinner: boolean;
  readonly isTopRow: boolean;
}) {
  const faces = hand === null ? [null, null] : [...hand.holeCards];

  return (
    <div
      data-testid={`seat-pod-${String(seatId)}-showdown`}
      data-shown={hand !== null}
      data-winner={isWinner}
      onClick={(event) => {
        event.stopPropagation();
      }}
      style={{
        position: "absolute",
        left: 0,
        right: 0,
        zIndex: 0,
        containerType: "inline-size",
        cursor: "default",
        ...(isTopRow ? { top: FAN_TUCK } : { bottom: FAN_TUCK }),
      }}
    >
      <div
        style={{
          position: "relative",
          margin: "0 auto",
          fontSize: FAN_SCALE,
          width: FAN_WIDTH,
          height: FAN_HEIGHT,
        }}
      >
        {faces.map((card, index) => (
          <div
            key={index}
            data-testid={`seat-pod-${String(seatId)}-showdown-card-${String(index)}`}
            style={{
              position: "absolute",
              left: index === 0 ? "0.33em" : "2.43em",
              top: index === 0 ? "0.3em" : 0,
              zIndex: isTopRow === (index === 0) ? 1 : 0,
              transform: `rotate(${String(index === 0 ? -8 : 7)}deg)`,
              filter: `drop-shadow(${shadow.card})`,
            }}
          >
            {card === null ? (
              <Card faceDown />
            ) : (
              <Card rank={card.rank} suit={card.suit} />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function deriveSeat(seat: SeatView, view: TableView | null): SeatVisual {
  const handSeat =
    view?.phase === "betting"
      ? view.seats.find((s) => s.seatId === seat.id)
      : undefined;
  const participatedInCurrentHand =
    view?.phase === "betting"
      ? handSeat !== undefined
      : view?.phase === "showdown"
        ? view.contestants.includes(seat.id)
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
      status = "in-hand";
    } else {
      status = seat.disconnected
        ? "disconnected"
        : seat.sittingOut
          ? "sitting-out"
          : "in-hand";
    }
  }

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

export function Seats({
  seats,
  view,
  shotClockSeconds = 90,
  onSeatClick,
  actionLabels,
}: SeatsProps) {
  const showdown = showdownSeats(view);

  return (
    <div data-testid="seats" style={{ position: "absolute", inset: 0 }}>
      {seats.map((seat) => {
        const visual = deriveSeat(seat, view);
        const seatShowdown = showdown.get(seat.id);
        const acted = visual.isActor ? undefined : actionLabels?.get(seat.id);
        const tabledHand = seatShowdown?.hand ?? null;
        const pos = posFor(seat.id, seats.length);
        const isTopRow = pos.top < 50;
        const flipDegrees = isTopRow ? 180 : 0;
        const flipStyle = isTopRow
          ? { transform: `rotate(${String(flipDegrees)}deg)` }
          : undefined;

        const avatarBlock = (
          <div key="avatar" style={{ position: "relative" }}>
            {visual.isActor && view?.phase === "betting" ? (
              <ShotClock
                turnEndsAt={view.turnEndsAt}
                durationSeconds={shotClockSeconds}
                variant="number"
                testId="seat-shot-clock"
                numberPosition="bottom-right"
              />
            ) : null}
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

        /**
         * The Seat plate keeps the anchor `posFor` gave it, and a tabled Hand
         * is hung off it rather than laid in the pod's flow, so cards are
         * additive and never push a plate off the felt.
         */
        const plate = (
          <div
            data-testid={`seat-pod-${String(seat.id)}-surface`}
            className={visual.isActor ? "seat-actor-glow" : undefined}
            style={{
              boxShadow: shadow.seatResting,
              position: "relative",
              zIndex: 1,
              borderRadius: "1em",
              padding: "0.5em",
              display: "flex",
              flexDirection: seatShowdown
                ? isTopRow
                  ? "row-reverse"
                  : "row"
                : "column",
              alignItems: "center",
              gap: seatShowdown ? "0.7em" : "0.4em",
              minWidth: seatShowdown ? "12.5em" : undefined,
              justifyContent: "center",
              background: seatShowdown
                ? visual.isWinner
                  ? `linear-gradient(${color.seatWinnerBackground},${color.seatWinnerBackground}),${color.seatTabledBackground}`
                  : color.seatTabledBackground
                : visual.isWinner
                  ? color.seatWinnerBackground
                  : visual.isActor
                    ? color.seatActorBackground
                    : visual.status === "sitting-out"
                      ? color.seatSittingOutBackground
                      : "transparent",
              border: `1px solid ${
                seatShowdown && !visual.isWinner
                  ? color.seatTabledBorder
                  : visual.isWinner
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
            {seatShowdown && (
              <ShowdownBadges
                seatId={seat.id}
                showdown={seatShowdown}
                isTopRow={isTopRow}
              />
            )}
            {podContent}
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
            {seatShowdown ? (
              <div style={{ position: "relative", display: "flex" }}>
                <ShowdownHand
                  seatId={seat.id}
                  hand={tabledHand}
                  isWinner={seatShowdown.isWinner}
                  isTopRow={isTopRow}
                />
                {plate}
              </div>
            ) : (
              plate
            )}
            <AnimatePresence>
              {visual.isActor ? (
                <motion.div
                  key="to-act"
                  data-testid={`seat-pod-${String(seat.id)}-to-act`}
                  data-flipped={isTopRow}
                  {...slotMotion(flipDegrees)}
                  style={{
                    ...slotPillStyle,
                    background: color.accent,
                    color: "#fff",
                  }}
                >
                  To act
                </motion.div>
              ) : acted !== undefined ? (
                <motion.div
                  key="acted"
                  data-testid={`seat-pod-${String(seat.id)}-action`}
                  data-action={acted}
                  data-flipped={isTopRow}
                  {...slotMotion(flipDegrees)}
                  style={{
                    ...slotPillStyle,
                    background: actionTone[acted].background,
                    color: actionTone[acted].ink,
                  }}
                >
                  {actionVerb[acted]}
                </motion.div>
              ) : null}
            </AnimatePresence>
            {seat.disconnected && (
              <span
                data-testid={`seat-pod-${String(seat.id)}-disconnected`}
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
