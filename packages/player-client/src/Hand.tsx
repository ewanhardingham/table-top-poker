import type {
  Card as CardType,
  PlayerView,
  SeatView,
} from "@table-top-poker/protocol";
import {
  Card,
  color,
  font,
  fontSize,
  radius,
  shadow,
} from "@table-top-poker/ui-shared";
import { motion } from "motion/react";
import type { ConnectionStatus } from "./store/connectionSlice.js";

export interface HandProps {
  readonly view: PlayerView;
  readonly seatId: number;
  readonly seats?: readonly SeatView[];
  readonly connectionStatus?: ConnectionStatus;
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

/**
 * Whether the viewer's seat appears in this street's `seats` — absent means
 * sitting out of the current hand, not dealt in (distinct from folded,
 * where the seat is present with `folded: true`).
 */
function isDealtIn(view: PlayerViewBetting): boolean {
  return view.seats.some((s) => s.seatId === view.yourSeatId);
}

function seatLabel(seatId: number, seats: readonly SeatView[]): string {
  return (
    seats.find((seat) => seat.id === seatId)?.displayName ??
    `Seat ${String(seatId + 1)}`
  );
}

/**
 * Whose-turn state as `{ kicker, text, tone }`, matching the prototype's
 * banner copy — the same box carries the result once the hand's decided
 * (issue #63), rather than a separate card competing with the hole cards
 * for attention. Connection state wins over hand state: nothing can be
 * acted on off-line, so that's surfaced first regardless of whose turn (or
 * whose win) the hand thinks it is.
 */
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

function TurnBanner({ banner }: { readonly banner: Banner }) {
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
      <span
        style={{
          width: "0.7em",
          height: "0.7em",
          borderRadius: "50%",
          flex: "none",
          background: tone.dot,
        }}
      />
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
    </motion.div>
  );
}

function HoleCards({
  cards,
  caption,
}: {
  readonly cards: readonly [CardType, CardType];
  readonly caption: string;
}) {
  return (
    <div
      style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: "0.9em",
        minHeight: 0,
      }}
    >
      <div
        data-testid="hole-cards"
        style={{ display: "flex", gap: "0.5em", fontSize: "2.6em" }}
      >
        {cards.map((card, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, rotateY: -92 }}
            animate={{ opacity: 1, rotateY: 0, rotate: i === 0 ? -3 : 3 }}
            transition={{
              duration: 0.42,
              delay: i * 0.08,
              ease: [0.2, 0.8, 0.2, 1],
            }}
          >
            <Card rank={card.rank} suit={card.suit} />
          </motion.div>
        ))}
      </div>
      <span
        style={{
          fontFamily: font.mono,
          fontSize: fontSize.xs,
          letterSpacing: "0.2em",
          textTransform: "uppercase",
          color: color.textDim,
        }}
      >
        {caption}
      </span>
    </div>
  );
}

function EmptyHoleCards({ text }: { readonly text: string }) {
  return (
    <div
      data-testid="no-hole-cards"
      style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: "1.1em",
        textAlign: "center",
      }}
    >
      <div style={{ display: "flex", gap: "0.9em" }}>
        <span
          style={{
            width: "6.5em",
            height: "9.2em",
            display: "block",
            borderRadius: radius.card,
            border: `1px dashed ${color.border}`,
            background: "rgba(255,255,255,.03)",
            transform: "rotate(-5deg)",
          }}
        />
        <span
          style={{
            width: "6.5em",
            height: "9.2em",
            display: "block",
            borderRadius: radius.card,
            border: `1px dashed ${color.border}`,
            background: "rgba(255,255,255,.03)",
            transform: "rotate(5deg)",
          }}
        />
      </div>
      <span
        style={{
          fontSize: fontSize.md,
          lineHeight: 1.5,
          color: color.textDim,
          maxWidth: "16em",
        }}
      >
        {text}
      </span>
    </div>
  );
}

/**
 * Own hole cards, mirrored straight from the seat's `view` — nothing
 * rebuilt from the raw event locally (Phase 1 spec #130 §9). Hidden
 * again once folded, a burn-pile per §4: `yourHoleCards` is already `null`
 * in that view, this never redacts. The shared board is deliberately never
 * shown here, showdown included — the player device stays hole-cards-only,
 * the board and every seat's revealed hand live on the table device
 * (issue #63); this seat's own result comes back through the turn banner
 * above, not a second card competing with the hole cards for attention.
 * Action buttons live in `ActionBar`, rendered alongside this by `App`.
 */
export function Hand({
  view,
  seatId,
  seats = [],
  connectionStatus = "connected",
}: HandProps) {
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
        <TurnBanner banner={bannerFor(view, connectionStatus, seatId, seats)} />
        <EmptyHoleCards text="Waiting for the next hand." />
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
        <TurnBanner banner={bannerFor(view, connectionStatus, seatId, seats)} />
        <EmptyHoleCards
          text={
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
        <TurnBanner banner={bannerFor(view, connectionStatus, seatId, seats)} />
        {myResult ? (
          <HoleCards
            cards={myResult.holeCards}
            caption="Your hole cards · showdown"
          />
        ) : (
          <EmptyHoleCards text="You folded — cards are in the muck." />
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
      <TurnBanner banner={bannerFor(view, connectionStatus, seatId, seats)} />
      {view.yourHoleCards ? (
        <HoleCards
          cards={view.yourHoleCards}
          caption={`Your hole cards · ${view.street}`}
        />
      ) : (
        <EmptyHoleCards
          text={
            isDealtIn(view)
              ? "You folded — cards are in the muck."
              : "Waiting for the next deal."
          }
        />
      )}
    </div>
  );
}
