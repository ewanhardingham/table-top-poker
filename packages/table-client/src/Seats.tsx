import type {
  ActionType,
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
import {
  ordinal,
  rankShowdownHands,
  type RankedShowdownHand,
} from "./showdownRanking.js";
import { posFor } from "./table/posFor.js";

/** PROTOTYPE scaffolding — remove with `src/prototype/`. See #252 feedback. */
export type ShowdownTreatment = "current" | "stack" | "fan" | "inline";

export interface SeatsProps {
  readonly seats: readonly SeatView[];
  readonly view: TableView | null;
  readonly shotClockSeconds?: number;
  readonly onSeatClick?: (seatId: number) => void;
  readonly actionLabels?: SeatActionLabels;
  /** PROTOTYPE scaffolding — remove with `src/prototype/`. */
  readonly showdownTreatment?: ShowdownTreatment;
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

const SHOWDOWN_CARD_SCALE = "clamp(0.34rem, 1.1vh, 0.55rem)";
const SHOWDOWN_LABEL_WIDTH = "8.5rem";

/** PROTOTYPE scaffolding — remove with `src/prototype/`. */
const treatmentScale: Record<ShowdownTreatment, string> = {
  current: SHOWDOWN_CARD_SCALE,
  stack: "clamp(0.85rem, 2.6vh, 1.25rem)",
  /** Sized off the plate it tucks behind: 5.8em of fan across 100% of the Seat. */
  fan: "15cqw",
  inline: "clamp(0.95rem, 2.9vh, 1.4rem)",
};

interface ShowdownSeat {
  readonly hand: RankedShowdownHand | null;
  readonly isWinner: boolean;
  readonly splitting: boolean;
}

function showdownSeats(view: TableView | null): Map<SeatId, ShowdownSeat> {
  const bySeat = new Map<SeatId, ShowdownSeat>();
  if (view?.phase !== "showdown") return bySeat;

  const winners = view.winners ?? [];
  const ranked = new Map(
    rankShowdownHands(view.results).map((hand) => [hand.result.seatId, hand]),
  );
  for (const seatId of view.contestants) {
    bySeat.set(seatId, {
      hand: ranked.get(seatId) ?? null,
      isWinner: winners.includes(seatId),
      splitting: winners.length > 1,
    });
  }
  return bySeat;
}
/**
 * The Hand a Seat made is never spelled out — the cards are the result and the
 * room reads them. Only the ordering and the outcome are the engine's to say.
 */
function outcomeOf(showdown: ShowdownSeat): string | null {
  if (!showdown.isWinner) return null;
  return showdown.splitting ? "splits" : "wins";
}

/**
 * The place and the outcome ride the Seat plate rather than the cards: a chip
 * laid over a tabled Hand covers the corner index that has to stay readable.
 */
function ShowdownBadges({
  seatId,
  showdown,
  big,
}: {
  readonly seatId: SeatId;
  readonly showdown: ShowdownSeat;
  readonly big: boolean;
}) {
  const testId = `seat-pod-${String(seatId)}-showdown`;
  const { hand, isWinner } = showdown;
  const outcome = outcomeOf(showdown);
  if (hand === null && outcome === null) return null;

  const chip = {
    flex: "none" as const,
    padding: big ? "0.2em 0.5em" : "0.15em 0.45em",
    borderRadius: "999px",
    fontFamily: font.mono,
    fontSize: big ? "0.58rem" : "0.55rem",
    fontWeight: 700,
    letterSpacing: "0.12em",
    textTransform: "uppercase" as const,
    whiteSpace: "nowrap" as const,
    lineHeight: 1.35,
  };

  return (
    <div
      data-testid={`${testId}-badges`}
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "stretch",
        gap: "0.3em",
      }}
    >
      {hand !== null && (
        <span
          data-testid={`${testId}-rank`}
          style={{
            ...chip,
            textAlign: "center",
            background: isWinner ? color.winBright : color.controlFill,
            border: `1px solid ${
              isWinner ? color.winBright : color.seatTabledBorder
            }`,
            color: isWinner ? color.pillInk : color.textBright,
          }}
        >
          {ordinal(hand.place)}
        </span>
      )}
      {outcome !== null && (
        <span
          data-testid={`${testId}-verdict`}
          style={{
            ...chip,
            textAlign: "center",
            background: color.winPlate,
            border: `1px solid ${color.winBorder}`,
            color: color.winBright,
          }}
        >
          {outcome}
        </span>
      )}
    </div>
  );
}

function ShowdownHand({
  seatId,
  showdown,
  treatment,
}: {
  readonly seatId: SeatId;
  readonly showdown: ShowdownSeat;
  readonly treatment: ShowdownTreatment;
}) {
  const testId = `seat-pod-${String(seatId)}-showdown`;
  const { hand, isWinner } = showdown;
  const scale = treatmentScale[treatment];
  const big = treatment !== "current";

  const faces =
    hand === null
      ? [null, null]
      : [hand.result.holeCards[0], hand.result.holeCards[1]];

  const flatCards = (
    <div
      style={{
        display: "flex",
        gap: big ? "0.15em" : "0.18em",
        padding: "0.2em",
        borderRadius: "0.4em",
        fontSize: scale,
        border: `1px solid ${isWinner ? color.winBorder : "transparent"}`,
        background: isWinner ? color.winPlate : undefined,
      }}
    >
      {faces.map((card, index) =>
        card === null ? (
          <Card key={index} faceDown />
        ) : (
          <Card key={index} rank={card.rank} suit={card.suit} />
        ),
      )}
    </div>
  );

  const wrapper = {
    "data-testid": testId,
    "data-shown": hand !== null,
    "data-winner": isWinner,
    "data-treatment": treatment,
    onClick: (event: { stopPropagation: () => void }) => {
      event.stopPropagation();
    },
  };

  if (treatment === "fan") {
    return (
      <div
        {...wrapper}
        style={{
          position: "relative",
          fontSize: scale,
          width: "100%",
          height: "5.6em",
          cursor: "default",
        }}
      >
        <div
          style={{
            position: "absolute",
            left: "50%",
            transform: "translateX(-50%)",
            width: "6.26em",
            height: "5.6em",
          }}
        >
          {faces.map((card, index) => (
            <div
              key={index}
              style={{
                position: "absolute",
                left: index === 0 ? "0.33em" : "2.43em",
                top: index === 0 ? "0.3em" : 0,
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

  if (treatment === "inline") {
    return (
      <div
        {...wrapper}
        style={{
          display: "flex",
          alignItems: "center",
          gap: "0.6rem",
          maxWidth: "13rem",
          cursor: "default",
        }}
      >
        {flatCards}
        <ShowdownBadges seatId={seatId} showdown={showdown} big={big} />
      </div>
    );
  }

  return (
    <div
      {...wrapper}
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: big ? "0.35rem" : "0.3em",
        maxWidth: big ? "11rem" : SHOWDOWN_LABEL_WIDTH,
        cursor: "default",
      }}
    >
      {flatCards}
      <ShowdownBadges seatId={seatId} showdown={showdown} big={big} />
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
  showdownTreatment = "current",
}: SeatsProps) {
  const showdown = showdownSeats(view);
  const inlineTabled = showdownTreatment === "inline";
  /**
   * The Seat plate keeps the anchor `posFor` gave it; a tabled Hand is lifted
   * out of the pod's flow and hung toward the table centre, so cards are
   * additive and never push a plate off the felt.
   */
  const hungTabled =
    showdownTreatment === "stack" || showdownTreatment === "fan";
  /** A Hand that touches the plate makes it opaque, or the Seat is unreadable. */
  const platedTabled =
    showdownTreatment === "fan" || showdownTreatment === "inline";

  return (
    <div data-testid="seats" style={{ position: "absolute", inset: 0 }}>
      {seats.map((seat) => {
        const visual = deriveSeat(seat, view);
        const seatShowdown = showdown.get(seat.id);
        const acted = visual.isActor ? undefined : actionLabels?.get(seat.id);
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
            {seatShowdown && hungTabled && (
              <div
                style={
                  showdownTreatment === "fan"
                    ? {
                        position: "absolute",
                        left: 0,
                        right: 0,
                        zIndex: 0,
                        containerType: "inline-size",
                        ...(isTopRow ? { top: "100%" } : { bottom: "100%" }),
                        transform: `translateY(${isTopRow ? "-62%" : "62%"})`,
                      }
                    : {
                        position: "absolute",
                        left: "50%",
                        zIndex: 0,
                        ...(isTopRow ? { top: "100%" } : { bottom: "100%" }),
                        transform: `translateX(-50%) translateY(${isTopRow ? "0.4em" : "-0.4em"})`,
                      }
                }
              >
                <ShowdownHand
                  seatId={seat.id}
                  showdown={seatShowdown}
                  treatment={showdownTreatment}
                />
              </div>
            )}
            {seatShowdown && !inlineTabled && !hungTabled && !isTopRow && (
              <ShowdownHand
                seatId={seat.id}
                showdown={seatShowdown}
                treatment={showdownTreatment}
              />
            )}
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
                zIndex: 1,
                borderRadius: "1em",
                padding: "0.5em",
                display: "flex",
                flexDirection: seatShowdown && platedTabled ? "row" : "column",
                alignItems: "center",
                gap: seatShowdown && platedTabled ? "0.7em" : "0.4em",
                minWidth:
                  seatShowdown && showdownTreatment === "fan"
                    ? "12.5em"
                    : undefined,
                justifyContent: "center",
                background:
                  seatShowdown && platedTabled
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
                  seatShowdown && platedTabled && !visual.isWinner
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
              {seatShowdown && showdownTreatment === "fan" && (
                <ShowdownBadges seatId={seat.id} showdown={seatShowdown} big />
              )}
              {seatShowdown && inlineTabled && !isTopRow && (
                <ShowdownHand
                  seatId={seat.id}
                  showdown={seatShowdown}
                  treatment={showdownTreatment}
                />
              )}
              {podContent}
              {seatShowdown && inlineTabled && isTopRow && (
                <ShowdownHand
                  seatId={seat.id}
                  showdown={seatShowdown}
                  treatment={showdownTreatment}
                />
              )}
            </motion.div>
            {seatShowdown && !inlineTabled && !hungTabled && isTopRow && (
              <ShowdownHand
                seatId={seat.id}
                showdown={seatShowdown}
                treatment={showdownTreatment}
              />
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
