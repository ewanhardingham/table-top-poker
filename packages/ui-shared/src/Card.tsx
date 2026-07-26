import type { Rank, Suit } from "@table-top-poker/protocol";
import type { CSSProperties } from "react";

export type CardProps =
  | { readonly faceDown: true }
  | { readonly faceDown?: false; readonly rank: Rank; readonly suit: Suit };

const suitSymbols: Record<Suit, string> = {
  clubs: "♣",
  diamonds: "♦",
  hearts: "♥",
  spades: "♠",
};

const redSuits: ReadonlySet<Suit> = new Set(["diamonds", "hearts"]);

const baseStyle: CSSProperties = {
  width: "3.5em",
  height: "5em",
  borderRadius: "0.3em",
  border: "1px solid #94a3b8",
  boxSizing: "border-box",
  display: "flex",
  flexDirection: "column",
  justifyContent: "center",
  alignItems: "center",
  fontFamily: "system-ui, sans-serif",
  userSelect: "none",
};

/**
 * Renders a card as DOM elements, branching on `faceDown` rather than
 * swapping an `<img>` src — required so Phase 3's flip animation can
 * cross-fade between the two branches instead of a network image swap.
 */
export function Card(props: CardProps) {
  if (props.faceDown) {
    return (
      <div
        className="card card-back"
        data-face-down="true"
        style={{ ...baseStyle, background: "#334155" }}
      />
    );
  }

  const { rank, suit } = props;
  return (
    <div
      className="card card-face"
      data-face-down="false"
      data-rank={rank}
      data-suit={suit}
      style={{
        ...baseStyle,
        background: "#f8fafc",
        color: redSuits.has(suit) ? "#dc2626" : "#0f172a",
      }}
    >
      <span className="card-rank">{rank}</span>
      <span className="card-suit">{suitSymbols[suit]}</span>
    </div>
  );
}
