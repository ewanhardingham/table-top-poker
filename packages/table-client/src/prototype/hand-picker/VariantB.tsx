/**
 * PROTOTYPE — throwaway, wayfinder ticket #81.
 *
 * Variant B — "Ledger". No cards at all. A dense, aligned, mono-typed table
 * of one line per hand: how many saw the flop, how far it went, what the
 * betting looked like, who took it. Bets that the *story* is what makes a
 * fold-out recognisable ("the one where seat 2 four-bet and seat 1 folded on
 * the turn") and that fitting the whole session on one screen without
 * scrolling beats any single hand being prettier.
 *
 * Ordering: oldest first — a log reads down, and hand 1 keeps a fixed row.
 * In-progress hand: shown at the bottom, not selectable.
 */
import { color, font, radius } from "@table-top-poker/ui-shared";
import {
  type HandSummary,
  actionShape,
  outcomeText,
  survivors,
  winnersOf,
} from "./summary.js";

const boardGlyph: Record<string, string> = {
  clubs: "♣",
  diamonds: "♦",
  hearts: "♥",
  spades: "♠",
};

/** The board as inline text — recognisable, but subordinate to the story. */
function boardText(hand: HandSummary): string {
  if (hand.board.length === 0) return "—";
  return hand.board
    .map((card) => `${card.rank}${boardGlyph[card.suit] ?? "?"}`)
    .join(" ");
}

const cell = {
  padding: "0.5em 0.7em",
  whiteSpace: "nowrap" as const,
};

const kicker = {
  fontFamily: font.mono,
  fontSize: "0.6em",
  letterSpacing: "0.16em",
  textTransform: "uppercase" as const,
  color: color.textDim,
};

export const variantBName = "Ledger — the story, no cards";

export function VariantB({
  hands,
  onSelect,
}: {
  readonly hands: readonly HandSummary[];
  readonly onSelect: (n: number) => void;
}) {
  const ordered = [...hands].sort((a, b) => a.handNumber - b.handNumber);
  return (
    <div
      style={{
        overflowY: "auto",
        border: `1px solid ${color.border}`,
        borderRadius: radius.control,
        background: color.surface,
      }}
    >
      <table
        style={{
          width: "100%",
          borderCollapse: "collapse",
          fontSize: "0.92em",
          color: color.text,
        }}
      >
        <thead>
          <tr>
            {["#", "In", "Street", "Board", "Betting", "Result"].map((h) => (
              <th key={h} style={{ ...cell, ...kicker, textAlign: "left" }}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {ordered.map((hand) => {
            const live = hand.outcome.kind === "in-progress";
            const won = winnersOf(hand).length > 0;
            return (
              <tr
                key={hand.handNumber}
                onClick={() => {
                  if (!live) onSelect(hand.handNumber);
                }}
                style={{
                  borderTop: `1px solid ${color.border}`,
                  background: live ? color.accentWash : "transparent",
                  cursor: live ? "default" : "pointer",
                  opacity: live ? 0.7 : 1,
                }}
              >
                <td
                  style={{
                    ...cell,
                    fontFamily: font.mono,
                    color: color.textBright,
                  }}
                >
                  {hand.handNumber}
                </td>
                <td style={{ ...cell, fontFamily: font.mono, color: color.textMuted }}>
                  {survivors(hand).length}/{hand.dealtIn.length}
                </td>
                <td style={{ ...cell, color: color.textMuted }}>{hand.lastStreet}</td>
                <td
                  style={{
                    ...cell,
                    fontFamily: font.mono,
                    letterSpacing: "0.06em",
                    color: color.textBright,
                  }}
                >
                  {boardText(hand)}
                </td>
                <td style={{ ...cell, color: color.textMuted }}>{actionShape(hand)}</td>
                <td
                  style={{
                    ...cell,
                    fontWeight: 600,
                    color: won ? color.winText : color.textDim,
                  }}
                >
                  {outcomeText(hand)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
