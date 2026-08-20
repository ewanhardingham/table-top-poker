import type {
  BettingShape,
  Card as CardType,
  HandSummary,
  SeatView,
  Street,
} from "@table-top-poker/protocol";
import {
  Card,
  Panel,
  color,
  font,
  fontSize,
  radius,
} from "@table-top-poker/ui-shared";
import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { seatLabel } from "./seatLabel.js";
import { showdownVerdict } from "./showdownVerdict.js";

export interface HandPickerProps {
  readonly summaries: readonly HandSummary[];
  readonly seats: readonly SeatView[];
  readonly onSelectHand: (handOrdinal: number) => void;
  readonly onClose: () => void;
}

/**
 * Polls `Date.now()` on an interval rather than computing the relative
 * label once at mount, so it visibly goes stale ("just now" -> "1m ago")
 * while the picker stays open (#129 §6).
 */
function useNow(): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => {
      setNow(Date.now());
    }, 1000);
    return () => {
      window.clearInterval(id);
    };
  }, []);
  return now;
}

function formatRelative(startedAt: string, now: number): string {
  const seconds = Math.max(
    0,
    Math.round((now - new Date(startedAt).getTime()) / 1000),
  );
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${String(minutes)}m ago`;
  const hours = Math.floor(minutes / 60);
  const remainderMinutes = minutes % 60;
  return remainderMinutes === 0
    ? `${String(hours)}h ago`
    : `${String(hours)}h ${String(remainderMinutes)}m ago`;
}

/** This client's copy for the wire's structured descriptor — see `BettingShape`. */
function bettingShapeText(shape: BettingShape): string {
  switch (shape.kind) {
    case "walk":
      return "walk — folded round";
    case "preflop-raise":
      return "preflop raise took it";
    case "checked-down":
      return "checked down";
    case "one-raise":
      return "one raise";
    case "raise-war":
      return `raise war — ${String(shape.raises)} raises`;
  }
}

const streetPhrase: Record<Street, string> = {
  preflop: "preflop",
  flop: "the flop",
  turn: "the turn",
  river: "the river",
};

function outcomeText(hand: HandSummary, seats: readonly SeatView[]): string {
  const { outcome } = hand;
  if (outcome.kind === "folded-out") {
    return `${seatLabel(outcome.winner, seats)} wins — everyone folded`;
  }
  const { names, verb, description } = showdownVerdict(
    outcome.winners,
    outcome.reveals,
    seats,
  );
  const headline = `${names.join(" & ")} ${verb}`;
  return description ? `${headline} — ${description}` : headline;
}

function BoardStrip({ board }: { readonly board: readonly CardType[] }) {
  const slots = Array.from({ length: 5 }, (_, i) => board[i] ?? null);
  return (
    <div style={{ display: "flex", gap: "0.35em", fontSize: "1.3em" }}>
      {slots.map((card, i) =>
        card ? (
          <Card key={i} rank={card.rank} suit={card.suit} />
        ) : (
          <div
            key={i}
            style={{
              width: "3.5em",
              height: "5em",
              borderRadius: "0.2em",
              border: `1px dashed ${color.border}`,
              background: color.mutedSurface,
            }}
          />
        ),
      )}
    </div>
  );
}

const rowStyle: CSSProperties = {
  font: "inherit",
  color: "inherit",
  textAlign: "left",
  cursor: "pointer",
  display: "grid",
  gridTemplateColumns: "3em 1fr 15em",
  alignItems: "center",
  gap: "1.2em",
  width: "100%",
  padding: "0.7em 1.1em",
  borderRadius: radius.control,
  border: `1px solid ${color.border}`,
  background: color.surfaceGradient,
};

function HandRow({
  hand,
  seats,
  now,
  onSelect,
}: {
  readonly hand: HandSummary;
  readonly seats: readonly SeatView[];
  readonly now: number;
  readonly onSelect: () => void;
}) {
  const outcome = outcomeText(hand, seats);
  return (
    <button
      type="button"
      data-testid={`hand-row-${String(hand.handOrdinal)}`}
      aria-label={`Review hand ${String(hand.handOrdinal)}`}
      onClick={onSelect}
      style={rowStyle}
    >
      <span
        style={{
          fontFamily: font.display,
          fontSize: "1.7em",
          color: color.textBright,
          lineHeight: 1,
        }}
      >
        {hand.handOrdinal}
      </span>

      <BoardStrip board={hand.board} />

      <span style={{ display: "flex", flexDirection: "column", gap: "0.3em" }}>
        <span
          style={{
            fontFamily: font.mono,
            fontSize: "0.62em",
            letterSpacing: "0.15em",
            textTransform: "uppercase",
            color: color.textDim,
          }}
        >
          {String(hand.survivors.length)} to {streetPhrase[hand.streetReached]}{" "}
          · {bettingShapeText(hand.bettingShape)}
        </span>
        <span
          style={{
            fontSize: "0.9em",
            fontWeight: 600,
            color: color.winText,
          }}
        >
          {outcome}
        </span>
        <span style={{ fontSize: "0.72em", color: color.textFaint }}>
          Button {seatLabel(hand.button, seats)} ·{" "}
          {formatRelative(hand.startedAt, now)}
        </span>
      </span>
    </button>
  );
}

const kickerStyle: CSSProperties = {
  fontFamily: font.mono,
  fontSize: fontSize.xs,
  letterSpacing: "0.24em",
  textTransform: "uppercase",
  color: color.textDim,
};

export function HandPicker({
  summaries,
  seats,
  onSelectHand,
  onClose,
}: HandPickerProps) {
  const now = useNow();
  const ordered = useMemo(
    () => [...summaries].sort((a, b) => b.handOrdinal - a.handOrdinal),
    [summaries],
  );

  return (
    <div
      data-testid="hand-picker"
      role="dialog"
      aria-modal="true"
      aria-labelledby="hand-picker-title"
      style={{
        position: "absolute",
        inset: 0,
        zIndex: 14,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "rgba(6,4,4,.66)",
        backdropFilter: "blur(5px)",
      }}
    >
      <Panel
        style={{
          width: "min(820px, calc(100% - 32px))",
          maxHeight: "min(720px, calc(100% - 64px))",
          borderRadius: radius.panel,
          background: color.surfaceGradient,
          display: "flex",
          flexDirection: "column",
        }}
      >
        <div
          style={{
            padding: "26px 30px 20px",
            display: "flex",
            justifyContent: "space-between",
            gap: 20,
            borderBottom: `1px solid ${color.border}`,
          }}
        >
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <span style={kickerStyle}>This session</span>
            <span
              id="hand-picker-title"
              style={{
                fontFamily: font.display,
                fontWeight: 800,
                letterSpacing: "-.03em",
                fontSize: fontSize.display,
                color: color.text,
              }}
            >
              Review hands
            </span>
          </div>
          <button
            type="button"
            aria-label="Close review hands"
            data-testid="close-hand-picker-button"
            onClick={onClose}
            style={{
              width: 42,
              height: 42,
              borderRadius: 13,
              border: `1px solid ${color.border}`,
              background: "transparent",
              color: color.textMuted,
              fontSize: 17,
              cursor: "pointer",
              flexShrink: 0,
            }}
          >
            ✕
          </button>
        </div>

        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "0.55em",
            overflowY: "auto",
            padding: "1em 1.2em 1.4em",
          }}
        >
          {ordered.length === 0 ? (
            <span
              style={{
                padding: "1.2em 0.4em",
                textAlign: "center",
                color: color.textDim,
                fontSize: fontSize.md,
              }}
            >
              No hands played yet this session.
            </span>
          ) : (
            ordered.map((hand) => (
              <HandRow
                key={hand.handOrdinal}
                hand={hand}
                seats={seats}
                now={now}
                onSelect={() => {
                  onSelectHand(hand.handOrdinal);
                }}
              />
            ))
          )}
        </div>
      </Panel>
    </div>
  );
}
