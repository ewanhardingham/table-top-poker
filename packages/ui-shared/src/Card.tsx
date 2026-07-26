import type { Rank, Suit } from "@table-top-poker/protocol";
import React from "react";

export interface CardProps {
  readonly rank?: Rank;
  readonly suit?: Suit;
  readonly faceDown?: boolean;
  readonly className?: string;
  readonly style?: React.CSSProperties;
}

const suitSymbols: Record<Suit, string> = {
  clubs: "♣",
  diamonds: "♦",
  hearts: "♥",
  spades: "♠",
};

const suitColors: Record<Suit, string> = {
  clubs: "#1e293b",
  diamonds: "#dc2626",
  hearts: "#dc2626",
  spades: "#1e293b",
};

export const Card: React.FC<CardProps> = ({
  rank,
  suit,
  faceDown = false,
  className = "",
  style,
}) => {
  const isFaceDown = faceDown || !rank || !suit;

  if (isFaceDown) {
    return (
      <div
        data-testid="card-back"
        className={`card card-back ${className}`}
        style={{
          width: "70px",
          height: "98px",
          borderRadius: "8px",
          backgroundColor: "#1e293b",
          border: "2px solid #334155",
          boxShadow: "0 4px 6px -1px rgba(0, 0, 0, 0.3)",
          position: "relative",
          boxSizing: "border-box",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          overflow: "hidden",
          userSelect: "none",
          ...style,
        }}
      >
        {/* Decorative CSS grid card-back pattern */}
        <div
          style={{
            position: "absolute",
            inset: "4px",
            borderRadius: "4px",
            border: "1px solid #475569",
            backgroundImage:
              "radial-gradient(#38bdf8 1px, transparent 1px), radial-gradient(#38bdf8 1px, #0f172a 1px)",
            backgroundSize: "8px 8px",
            backgroundPosition: "0 0, 4px 4px",
            opacity: 0.8,
          }}
        />
        <div
          style={{
            position: "relative",
            zIndex: 1,
            color: "#38bdf8",
            fontSize: "20px",
            fontWeight: "bold",
          }}
        >
          ♠
        </div>
      </div>
    );
  }

  const symbol = suitSymbols[suit];
  const color = suitColors[suit];

  return (
    <div
      data-testid="card-face"
      data-rank={rank}
      data-suit={suit}
      className={`card card-face card-${suit} ${className}`}
      style={{
        width: "70px",
        height: "98px",
        borderRadius: "8px",
        backgroundColor: "#ffffff",
        border: "1px solid #cbd5e1",
        boxShadow: "0 4px 6px -1px rgba(0, 0, 0, 0.2)",
        position: "relative",
        boxSizing: "border-box",
        padding: "4px 6px",
        display: "inline-flex",
        flexDirection: "column",
        justifyContent: "space-between",
        color,
        fontFamily: "system-ui, -apple-system, sans-serif",
        userSelect: "none",
        overflow: "hidden",
        ...style,
      }}
    >
      {/* Top Left Rank & Suit */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "flex-start",
          lineHeight: "1",
        }}
      >
        <span style={{ fontSize: "15px", fontWeight: "bold" }}>{rank}</span>
        <span style={{ fontSize: "14px" }}>{symbol}</span>
      </div>

      {/* Center Suit Symbol */}
      <div
        style={{
          position: "absolute",
          top: "50%",
          left: "50%",
          transform: "translate(-50%, -50%)",
          fontSize: "28px",
          opacity: 0.9,
        }}
      >
        {symbol}
      </div>

      {/* Bottom Right Rank & Suit (Inverted) */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "flex-end",
          lineHeight: "1",
          transform: "rotate(180deg)",
        }}
      >
        <span style={{ fontSize: "15px", fontWeight: "bold" }}>{rank}</span>
        <span style={{ fontSize: "14px" }}>{symbol}</span>
      </div>
    </div>
  );
};
