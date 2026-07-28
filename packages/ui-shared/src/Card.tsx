import type { Rank, Suit } from "@table-top-poker/protocol";
import type { CSSProperties } from "react";
import { color, font, radius, shadow } from "./theme.js";

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
  borderRadius: radius.card,
  boxSizing: "border-box",
  fontFamily: font.body,
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
        style={{ ...baseStyle, background: color.cardBack }}
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
        background: color.cardFace,
        border: `1px solid ${color.cardBorder}`,
        boxShadow: shadow.card,
        color: redSuits.has(suit) ? color.suitRed : color.suitBlack,
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        padding: "0.15em 0.18em",
      }}
    >
      <span
        className="card-rank"
        style={{
          display: "flex",
          alignItems: "baseline",
          gap: "0.06em",
          fontWeight: 700,
          fontSize: "1.1em",
          lineHeight: 0.9,
        }}
      >
        {rank}
        <span style={{ fontSize: "0.55em" }}>{suitSymbols[suit]}</span>
      </span>
      <span
        className="card-suit"
        style={{ textAlign: "right", fontSize: "1.4em", lineHeight: 0.8 }}
      >
        {suitSymbols[suit]}
      </span>
    </div>
  );
}
