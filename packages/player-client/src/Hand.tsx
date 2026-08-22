import type {
  Card as CardType,
  PlayerView,
  SeatView,
} from "@table-top-poker/protocol";
import {
  color,
  font,
  fontSize,
  positionMarkerFor,
  radius,
  shadow,
  ShotClock,
  type PositionMarker,
} from "@table-top-poker/ui-shared";
import { motion } from "motion/react";
import type { CSSProperties } from "react";
import { RejectionNotice } from "./actions/RejectionNotice.js";
import type { ActionIntent } from "./actions/useActionIntent.js";
import { HoleCardPair, type CardActions } from "./holecards/index.js";
import { PositionBadge } from "./PositionBadge.js";
import type { ConnectionStatus } from "./store/connectionSlice.js";

export interface HandProps {
  readonly view: PlayerView;
  readonly seatId: number;
  readonly seats?: readonly SeatView[];
  readonly connectionStatus?: ConnectionStatus;
  readonly shotClockSeconds?: number;
  readonly showdownClockSeconds?: number;
  readonly intent?: ActionIntent;
}

const noAction = () => undefined;

interface ShowdownTurn {
  readonly showdownOpen: boolean;
  readonly showLegal: boolean;
  readonly muckLegal: boolean;
}

/** At Showdown the reveal gesture publishes: see ADR-0008's amendment for #253. */
export function showdownTurn(view: PlayerView): ShowdownTurn {
  if (view.phase !== "showdown" || view.winners !== null) {
    return { showdownOpen: false, showLegal: false, muckLegal: false };
  }
  return {
    showdownOpen: true,
    showLegal: view.canShow,
    muckLegal: view.canMuck,
  };
}

function cardActionsFrom(
  intent: ActionIntent | undefined,
  turn: ShowdownTurn,
): CardActions {
  if (intent === undefined) {
    return {
      foldLegal: false,
      checkLegal: false,
      ...turn,
      pending: false,
      fold: noAction,
      check: noAction,
      show: noAction,
      muck: noAction,
    };
  }
  return {
    foldLegal: intent.legalActions.includes("fold"),
    checkLegal: intent.legalActions.includes("check"),
    ...turn,
    pending: intent.pendingAction !== null,
    fold: intent.fold,
    check: intent.check,
    show: intent.show,
    muck: intent.muck,
  };
}

/** A persistent prompt, not `coaching.ts`'s one-shot teaching — see ADR-0009. */
export function showdownPrompt(turn: ShowdownTurn): string | null {
  if (!turn.showLegal) return null;
  return turn.muckLegal
    ? "Show your hand, or drag up to muck"
    : "Show your hand";
}

type BannerTone = "turn" | "all-in" | "win" | "loss" | "idle" | "offline";

interface Banner {
  readonly kicker: string;
  readonly text: string;
  readonly tone: BannerTone;
}

const bannerToneStyle: Record<
  BannerTone,
  {
    readonly background: string;
    readonly border: string;
    readonly dot: string;
    readonly kicker: string;
    readonly text: string;
  }
> = {
  turn: {
    background:
      "linear-gradient(120deg,rgba(229,68,60,.22),rgba(229,68,60,.08))",
    border: color.accentBorder,
    dot: color.accentBright,
    kicker: color.textBright,
    text: color.text,
  },
  "all-in": {
    background:
      "linear-gradient(120deg,rgba(229,68,60,.28),rgba(229,68,60,.10))",
    border: color.accentBright,
    dot: color.accentBright,
    kicker: color.textBright,
    text: color.textBright,
  },
  win: {
    background: color.winBackground,
    border: color.winBorder,
    dot: color.winBright,
    kicker: color.winKicker,
    text: color.winText,
  },
  loss: {
    background: color.lossBackground,
    border: color.lossBorder,
    dot: color.accentBright,
    kicker: color.textBright,
    text: color.text,
  },
  idle: {
    background: "rgba(255,255,255,.04)",
    border: color.border,
    dot: color.textFaint,
    kicker: color.textDim,
    text: color.textMuted,
  },
  offline: {
    background: color.overlay,
    border: color.border,
    dot: color.textFaint,
    kicker: color.textFaint,
    text: color.textDim,
  },
};

type PlayerViewBetting = Extract<PlayerView, { phase: "betting" }>;

function isDealtIn(view: PlayerViewBetting): boolean {
  return view.seats.some((s) => s.seatId === view.yourSeatId);
}

function isAllIn(view: PlayerView): boolean {
  return (
    view.phase === "betting" &&
    (view.seats.find((s) => s.seatId === view.yourSeatId)?.allIn ?? false)
  );
}

function seatLabel(seatId: number, seats: readonly SeatView[]): string {
  return (
    seats.find((seat) => seat.id === seatId)?.displayName ??
    `Seat ${String(seatId + 1)}`
  );
}

function bannerFor(
  view: PlayerView,
  connectionStatus: ConnectionStatus,
  seatId: number,
  seats: readonly SeatView[],
): Banner {
  if (connectionStatus !== "connected") {
    return {
      kicker: connectionStatus === "connecting" ? "Reconnecting" : "Offline",
      text: "Actions won't send until you're back online.",
      tone: "offline",
    };
  }

  if (view.phase === "no-hand") {
    return { kicker: "Table", text: "Waiting for the next hand", tone: "idle" };
  }

  if (view.phase === "showdown") {
    const winners = view.winners;
    if (winners === null) {
      const prompt = showdownPrompt(showdownTurn(view));
      if (prompt !== null) {
        return { kicker: "Your turn", text: prompt, tone: "turn" };
      }
      const waitingOn = view.queue[0];
      return {
        kicker: "Showdown",
        text:
          waitingOn === undefined
            ? "Waiting for the hands to be turned over"
            : `Waiting on ${seatLabel(waitingOn, seats)}`,
        tone: "idle",
      };
    }
    const iWon = winners.includes(seatId);
    const winnerResult = view.results.find(
      (result) => result.seatId === winners[0],
    );
    if (iWon) {
      const label = winners.length > 1 ? "You split the pot" : "You win";
      return {
        kicker: "Hand complete",
        text: winnerResult
          ? `${label} with ${winnerResult.description}`
          : label,
        tone: "win",
      };
    }
    const winnerNames = winners
      .map((winner) => seatLabel(winner, seats))
      .join(" & ");
    const winClause = winnerResult
      ? `${winnerNames} wins with ${winnerResult.description}`
      : `${winnerNames} wins`;
    const myResult = view.yourResult;
    const yourClause = myResult
      ? ` — you had ${myResult.description}`
      : " — you folded earlier";
    return {
      kicker: "Hand complete",
      text: winClause + yourClause,
      tone: "loss",
    };
  }

  if (view.phase === "folded-out") {
    const iWon = view.winner === seatId;
    return {
      kicker: "Hand complete",
      text: iWon
        ? "You win — everyone folded"
        : `${seatLabel(view.winner, seats)} wins — everyone folded`,
      tone: iWon ? "win" : "loss",
    };
  }

  const dealtIn = isDealtIn(view);
  const folded =
    view.seats.find((s) => s.seatId === view.yourSeatId)?.folded ?? false;
  const myTurn = view.legalActions.length > 0;

  if (myTurn) {
    return {
      kicker: "Your turn",
      text: `You're to act — ${view.street}`,
      tone: "turn",
    };
  }
  if (isAllIn(view)) {
    return {
      kicker: "All in",
      text: "Your chips are in — the board runs out",
      tone: "all-in",
    };
  }
  if (folded) {
    return { kicker: "Folded", text: "Sitting this one out", tone: "idle" };
  }
  if (dealtIn) {
    const waitingOn = view.toAct[0];
    return {
      kicker: view.street,
      text:
        waitingOn !== undefined
          ? `Waiting on ${seatLabel(waitingOn, seats)}`
          : "Waiting on other players",
      tone: "idle",
    };
  }
  return {
    kicker: "Sitting out",
    text: "Dealt back in next hand",
    tone: "idle",
  };
}

function TurnBanner({
  banner,
  marker,
  turnEndsAt,
  shotClockSeconds,
}: {
  readonly banner: Banner;
  readonly marker: PositionMarker | null;
  readonly turnEndsAt: number | null;
  readonly shotClockSeconds: number;
}) {
  const tone = bannerToneStyle[banner.tone];
  return (
    <motion.div
      data-testid="turn-banner"
      data-tone={banner.tone}
      animate={
        banner.tone === "turn"
          ? { boxShadow: [...shadow.seatActorGlow] }
          : { boxShadow: "none" }
      }
      transition={
        banner.tone === "turn"
          ? { duration: 1.7, repeat: Infinity, ease: "easeInOut" }
          : { duration: 0.2 }
      }
      style={{
        display: "flex",
        alignItems: "center",
        gap: "0.8em",
        borderRadius: radius.panel,
        padding: "0.9em 1.1em",
        background: tone.background,
        border: `1px solid ${tone.border}`,
      }}
    >
      {marker ? (
        <PositionBadge marker={marker} dimmed={banner.tone === "offline"} />
      ) : (
        <span
          data-testid="turn-banner-dot"
          style={{
            width: "0.7em",
            height: "0.7em",
            borderRadius: "50%",
            flex: "none",
            background: tone.dot,
          }}
        />
      )}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "0.1em",
          minWidth: 0,
        }}
      >
        <span
          data-testid="turn-banner-kicker"
          style={{
            fontFamily: font.mono,
            fontSize: fontSize.xs,
            letterSpacing: "0.22em",
            textTransform: "uppercase",
            color: tone.kicker,
          }}
        >
          {banner.kicker}
        </span>
        <span
          data-testid="turn-banner-text"
          style={{ fontSize: fontSize.md, fontWeight: 600, color: tone.text }}
        >
          {banner.text}
        </span>
      </div>
      {banner.tone === "turn" && turnEndsAt !== null ? (
        <ShotClock
          turnEndsAt={turnEndsAt}
          durationSeconds={shotClockSeconds}
          variant="ring"
          testId="turn-banner-shot-clock"
        />
      ) : null}
    </motion.div>
  );
}

const absentCaptionStyle: CSSProperties = {
  fontSize: fontSize.md,
  lineHeight: 1.5,
  color: color.textDim,
  maxWidth: "16em",
};

function HoleCardsRegion({
  cards,
  locked = false,
  sealed = false,
  actions,
  caption,
  clock,
}: {
  readonly cards: readonly [CardType, CardType] | null;
  readonly locked?: boolean;
  readonly sealed?: boolean;
  readonly actions: CardActions;
  readonly caption?: string;
  readonly clock?: {
    readonly turnEndsAt: number | null;
    readonly durationSeconds: number;
  };
}) {
  const absent = cards === null;
  return (
    <div
      style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: "1.1em",
        minHeight: 0,
        textAlign: "center",
      }}
    >
      {clock && clock.turnEndsAt !== null ? (
        <ShotClock
          turnEndsAt={clock.turnEndsAt}
          durationSeconds={clock.durationSeconds}
          variant="ring"
          testId="showdown-shot-clock"
        />
      ) : null}
      <HoleCardPair
        cards={cards}
        locked={locked}
        sealed={sealed}
        actions={actions}
      />
      {absent && <span style={absentCaptionStyle}>{caption}</span>}
    </div>
  );
}

export function Hand({
  view,
  seatId,
  seats = [],
  connectionStatus = "connected",
  shotClockSeconds = 90,
  showdownClockSeconds = 30,
  intent,
}: HandProps) {
  const turn = showdownTurn(view);
  const actions = cardActionsFrom(intent, turn);

  if (view.phase === "no-hand") {
    return (
      <div
        data-testid="hand"
        data-phase="no-hand"
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          minHeight: 0,
          gap: "1em",
        }}
      >
        <TurnBanner
          banner={bannerFor(view, connectionStatus, seatId, seats)}
          marker={positionMarkerFor(seatId, view)}
          turnEndsAt={null}
          shotClockSeconds={shotClockSeconds}
        />
        <HoleCardsRegion
          cards={null}
          actions={actions}
          caption="Waiting for the next hand."
        />
      </div>
    );
  }

  if (view.phase === "folded-out") {
    const iWon = view.winner === seatId;
    return (
      <div
        data-testid="hand"
        data-phase="folded-out"
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          minHeight: 0,
          gap: "1em",
        }}
      >
        <TurnBanner
          banner={bannerFor(view, connectionStatus, seatId, seats)}
          marker={positionMarkerFor(seatId, view)}
          turnEndsAt={null}
          shotClockSeconds={shotClockSeconds}
        />
        <HoleCardsRegion
          cards={null}
          actions={actions}
          caption={
            iWon
              ? "No showdown — everyone else folded."
              : "You folded — cards are in the muck."
          }
        />
      </div>
    );
  }

  if (view.phase === "showdown") {
    const myResult = view.yourResult;
    const iHaveShown = view.results.some(
      (result) => result.seatId === view.yourSeatId,
    );
    return (
      <div
        data-testid="hand"
        data-phase="showdown"
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          minHeight: 0,
          gap: "1em",
        }}
      >
        <TurnBanner
          banner={bannerFor(view, connectionStatus, seatId, seats)}
          marker={positionMarkerFor(seatId, view)}
          turnEndsAt={null}
          shotClockSeconds={shotClockSeconds}
        />
        {myResult ? (
          <HoleCardsRegion
            cards={myResult.holeCards}
            locked={iHaveShown}
            actions={actions}
            clock={{
              turnEndsAt: turn.showLegal ? view.turnEndsAt : null,
              durationSeconds: showdownClockSeconds,
            }}
          />
        ) : (
          <HoleCardsRegion
            cards={null}
            actions={actions}
            caption={
              view.mucked.includes(seatId)
                ? "You mucked — cards are in the muck."
                : "You folded — cards are in the muck."
            }
          />
        )}
        {intent?.rejection != null && (
          <RejectionNotice rejection={intent.rejection} />
        )}
      </div>
    );
  }

  return (
    <div
      data-testid="hand"
      data-phase="betting"
      data-street={view.street}
      style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        minHeight: 0,
        gap: "1em",
      }}
    >
      <TurnBanner
        banner={bannerFor(view, connectionStatus, seatId, seats)}
        marker={positionMarkerFor(seatId, view)}
        turnEndsAt={view.legalActions.length > 0 ? view.turnEndsAt : null}
        shotClockSeconds={shotClockSeconds}
      />
      {view.yourHoleCards ? (
        <HoleCardsRegion
          cards={view.yourHoleCards}
          sealed={isAllIn(view)}
          actions={actions}
        />
      ) : (
        <HoleCardsRegion
          cards={null}
          actions={actions}
          caption={
            isDealtIn(view)
              ? "You folded — cards are in the muck."
              : "Waiting for the next deal."
          }
        />
      )}
    </div>
  );
}
