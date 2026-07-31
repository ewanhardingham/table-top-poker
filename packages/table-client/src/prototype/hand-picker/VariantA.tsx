/**
 * PROTOTYPE — throwaway, wayfinder ticket #81.
 *
 * Variant A — "Filmstrip". One row per hand, the *board* carried as real
 * cards at the row's centre. Bets that the board is the most recognisable
 * thing about a hand ("the one with the three eights"), and that undealt
 * streets should be shown as empty slots so a preflop walk reads as a
 * visibly short hand rather than a missing one.
 *
 * Ordering: newest first. In-progress hand: shown at top, not selectable.
 */
import { Card, color, font, radius } from "@table-top-poker/ui-shared";
import {
  type HandSummary,
  actionShape,
  outcomeText,
  seatLabel,
  survivors,
  winnersOf,
} from "./summary.js";

function BoardStrip({ hand }: { readonly hand: HandSummary }) {
  const slots = Array.from({ length: 5 }, (_, i) => hand.board[i] ?? null);
  return (
    <div style={{ display: "flex", gap: "0.35em", fontSize: "1.35em" }}>
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

function Row({
  hand,
  onSelect,
}: {
  readonly hand: HandSummary;
  readonly onSelect: (n: number) => void;
}) {
  const live = hand.outcome.kind === "in-progress";
  const winners = winnersOf(hand);
  return (
    <button
      type="button"
      disabled={live}
      onClick={() => {
        onSelect(hand.handNumber);
      }}
      style={{
        display: "grid",
        gridTemplateColumns: "3.5em 1fr 15em",
        alignItems: "center",
        gap: "1.2em",
        width: "100%",
        textAlign: "left",
        padding: "0.7em 1.1em",
        borderRadius: radius.control,
        border: `1px solid ${live ? color.accentBorder : color.border}`,
        background: live ? color.accentWash : color.surfaceGradient,
        color: color.text,
        font: "inherit",
        cursor: live ? "default" : "pointer",
        opacity: live ? 0.72 : 1,
      }}
    >
      <span
        style={{
          fontFamily: font.display,
          fontSize: "1.9em",
          color: live ? color.textDim : color.textBright,
          lineHeight: 1,
        }}
      >
        {hand.handNumber}
      </span>

      <BoardStrip hand={hand} />

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
          {live
            ? "Live"
            : `${String(survivors(hand).length)} to ${hand.lastStreet} · ${actionShape(hand)}`}
        </span>
        <span
          style={{
            fontSize: "0.9em",
            fontWeight: 600,
            color: winners.length > 0 ? color.winText : color.textMuted,
          }}
        >
          {outcomeText(hand)}
        </span>
        <span style={{ fontSize: "0.72em", color: color.textFaint }}>
          Button {seatLabel(hand.button)}
        </span>
      </span>
    </button>
  );
}

export const variantAName = "Filmstrip — board-first rows";

export function VariantA({
  hands,
  onSelect,
}: {
  readonly hands: readonly HandSummary[];
  readonly onSelect: (n: number) => void;
}) {
  const ordered = [...hands].sort((a, b) => b.handNumber - a.handNumber);
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "0.55em",
        overflowY: "auto",
        padding: "0.2em",
      }}
    >
      {ordered.map((hand) => (
        <Row key={hand.handNumber} hand={hand} onSelect={onSelect} />
      ))}
    </div>
  );
}
