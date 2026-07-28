import type { Card as CardType, PlayerView } from "@table-top-poker/protocol";
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
  readonly connectionStatus?: ConnectionStatus;
}

type TurnBannerView = Extract<
  PlayerView,
  { phase: "no-hand" } | { phase: "betting" }
>;

type BannerTone = "turn" | "idle" | "offline";

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

/**
 * Whose-turn state as `{ kicker, text, tone }`, matching the prototype's
 * banner copy — only for the `no-hand` and `betting` phases. Showdown and
 * folded-out get their own result treatment from #63 (the showdown result
 * card ticket), not this banner. Connection state wins over hand state:
 * nothing can be acted on off-line, so that's surfaced first regardless of
 * whose turn the hand thinks it is.
 */
function bannerFor(
  view: TurnBannerView,
  connectionStatus: ConnectionStatus,
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
          ? `Waiting on Seat ${String(waitingOn + 1)}`
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
 * rebuilt from the raw event locally (docs/phase-1-spec.md §9). Hidden
 * again once folded, a burn-pile per §4: `yourHoleCards` is already `null`
 * in that view, this never redacts. The shared board is deliberately not
 * shown here mid-hand — the player device stays hole-cards-only, the board
 * lives on the table device — but does reappear on the showdown screen,
 * alongside the winning hand(s), since there's nothing left to keep secret.
 * Action buttons live in `ActionBar`, rendered alongside this by `App`.
 */
export function Hand({ view, connectionStatus = "connected" }: HandProps) {
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
        <TurnBanner banner={bannerFor(view, connectionStatus)} />
        <EmptyHoleCards text="Waiting for the next hand." />
      </div>
    );
  }

  if (view.phase === "folded-out") {
    return (
      <div data-testid="hand" data-phase="folded-out">
        Hand complete.
      </div>
    );
  }

  if (view.phase === "showdown") {
    const winningResults = view.results.filter((result) =>
      view.winners.includes(result.seatId),
    );
    return (
      <div data-testid="hand" data-phase="showdown">
        <div data-testid="community-cards">
          {view.board.map((card, i) => (
            <Card key={i} rank={card.rank} suit={card.suit} />
          ))}
        </div>
        <ul data-testid="winning-hands">
          {winningResults.map((result) => (
            <li
              key={result.seatId}
              data-testid={`winning-hand-${String(result.seatId)}`}
            >
              Seat {result.seatId + 1}: {result.description}
              <div data-testid={`winning-cards-${String(result.seatId)}`}>
                {result.holeCards.map((card, i) => (
                  <Card key={i} rank={card.rank} suit={card.suit} />
                ))}
              </div>
            </li>
          ))}
        </ul>
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
      <TurnBanner banner={bannerFor(view, connectionStatus)} />
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
