import { color, font, fontSize, radius } from "@table-top-poker/ui-shared";
import type { CSSProperties } from "react";

export interface JoinCodeToggleProps {
  readonly roomCode: string;
  readonly open: boolean;
  readonly onToggle: () => void;
}

const wrapperStyle: CSSProperties = {
  position: "absolute",
  left: "50%",
  top: 22,
  transform: "translateX(-50%)",
  zIndex: 11,
};

const buttonStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 11,
  padding: "10px 16px",
  borderRadius: radius.pill,
  background: color.control,
  border: `1px solid ${color.accentBorder}`,
  backdropFilter: "blur(6px)",
  WebkitBackdropFilter: "blur(6px)",
};

/**
 * Top-centre pill that stays visible once a room exists, letting the table
 * device peek at the join code/QR mid-hand without losing the board view.
 */
export function JoinCodeToggle({
  roomCode,
  open,
  onToggle,
}: JoinCodeToggleProps) {
  return (
    <div style={wrapperStyle}>
      <button
        type="button"
        data-testid="join-code-toggle"
        onClick={onToggle}
        style={buttonStyle}
      >
        <span
          style={{
            fontFamily: font.mono,
            fontSize: fontSize.xs,
            fontWeight: 600,
            letterSpacing: "0.2em",
            textTransform: "uppercase",
            color: color.textDim,
          }}
        >
          {open ? "Hide code" : "Room"}
        </span>
        <span
          style={{
            fontFamily: font.mono,
            fontWeight: 700,
            fontSize: fontSize.lg,
            letterSpacing: "0.14em",
            color: color.textBright,
          }}
        >
          {roomCode}
        </span>
      </button>
    </div>
  );
}
