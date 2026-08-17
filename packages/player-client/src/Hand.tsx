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
  readonly intent?: ActionIntent;
}

const noAction = () => undefined;

function cardActionsFrom(intent: ActionIntent | undefined): CardActions {
  if (intent === undefined) {
    return {
      foldLegal: false,
      checkLegal: false,
      pending: false,
      fold: noAction,
      check: noAction,
    };
  }
  return {
    foldLegal: intent.legalActions.includes("fold"),
    checkLegal: intent.legalActions.includes("check"),
    pending: intent.pendingAction !== null,
    fold: intent.fold,
    check: intent.check,
  };
}

type BannerTone = "turn" | "win" | "loss" | "idle" | "offline";

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
    const iWon = view.winners.includes(seatId);
    const winnerResult = view.results.find(
      (result) => result.seatId === view.winners[0],
    );
    if (iWon) {
      const label = view.winners.length > 1 ? "You split the pot" : "You win";
      return {
        kicker: "Hand complete",
        text: winnerResult
          ? `${label} with ${winnerResult.description}`
          : label,
        tone: "win",
      };
    }
    const winnerNames = view.winners
      .map((winner) => seatLabel(winner, seats))
      .join(" & ");
    const winClause = winnerResult
      ? `${winnerNames} wins with ${winnerResult.description}`
      : `${winnerNames} wins`;
    const myResult = view.results.find((result) => result.seatId === seatId);
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
  actions,
  caption,
}: {
  readonly cards: readonly [CardType, CardType] | null;
  readonly locked?: boolean;
  readonly actions: CardActions;
  readonly caption?: string;
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
      <HoleCardPair cards={cards} locked={locked} actions={actions} />
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
  intent,
}: HandProps) {
  const actions = cardActionsFrom(intent);

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
    const myResult = view.results.find((result) => result.seatId === seatId);
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
            locked
            actions={actions}
          />
        ) : (
          <HoleCardsRegion
            cards={null}
            actions={actions}
            caption="You folded — cards are in the muck."
          />
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
        <HoleCardsRegion cards={view.yourHoleCards} actions={actions} />
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
