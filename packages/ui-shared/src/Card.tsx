import type { Rank, Suit } from "@table-top-poker/protocol";
import type { CSSProperties } from "react";
import { color, font, shadow } from "./theme.js";

export type CardProps =
  | { readonly faceDown: true }
  | { readonly faceDown?: false; readonly rank: Rank; readonly suit: Suit };

export const suitSymbols: Record<Suit, string> = {
  clubs: "♣",
  diamonds: "♦",
  hearts: "♥",
  spades: "♠",
};

const redSuits: ReadonlySet<Suit> = new Set(["diamonds", "hearts"]);

export function isRedSuit(suit: Suit): boolean {
  return redSuits.has(suit);
}

const baseStyle: CSSProperties = {
  width: "3.5em",
  height: "5em",
  borderRadius: "0.2em",
  boxSizing: "border-box",
  fontFamily: font.body,
  userSelect: "none",
};

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
        position: "relative",
        background: color.cardFace,
        border: `1px solid ${color.cardBorder}`,
        boxShadow: shadow.card,
        color: isRedSuit(suit) ? color.suitRed : color.suitBlack,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Index rank={rank} suit={suit} />
      <span
        className="card-suit"
        style={{ fontSize: "1.9em", lineHeight: 1, opacity: 0.86 }}
      >
        {suitSymbols[suit]}
      </span>
      <Index rank={rank} suit={suit} mirrored />
    </div>
  );
}

export const cardIndexStyle: CSSProperties = {
  position: "absolute",
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  fontWeight: 700,
  fontSize: "0.8em",
  lineHeight: 0.78,
};

export const cardIndexSuitStyle: CSSProperties = {
  marginTop: "0.2em",
  fontSize: "0.75em",
  fontWeight: 400,
};

function Index({
  rank,
  suit,
  mirrored = false,
}: {
  readonly rank: Rank;
  readonly suit: Suit;
  readonly mirrored?: boolean;
}) {
  return (
    <span
      className={mirrored ? "card-index card-index-mirrored" : "card-index"}
      style={{
        ...cardIndexStyle,
        ...(mirrored
          ? { right: "0.235em", bottom: "0.21em", transform: "rotate(180deg)" }
          : { left: "0.235em", top: "0.21em" }),
      }}
    >
      {rank}
      <span style={cardIndexSuitStyle}>{suitSymbols[suit]}</span>
    </span>
  );
}
