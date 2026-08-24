import { color, font, radius } from "@table-top-poker/ui-shared";
import type { CSSProperties } from "react";

export interface JoinCodeToggleProps {
  readonly roomCode: string;
  readonly onOpen: () => void;
}

const wrapperStyle: CSSProperties = {
  flex: "0 1 auto",
  minWidth: 0,
};

const buttonStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "0.7em",
  padding: "0.62em 1em",
  borderRadius: radius.pill,
  background: color.control,
  border: `1px solid ${color.accentBorder}`,
  backdropFilter: "blur(6px)",
  WebkitBackdropFilter: "blur(6px)",
  overflow: "hidden",
};

export function JoinCodeToggle({ roomCode, onOpen }: JoinCodeToggleProps) {
  return (
    <div style={wrapperStyle}>
      <button
        type="button"
        data-testid="join-code-toggle"
        onClick={onOpen}
        style={buttonStyle}
      >
        <span
          style={{
            minWidth: 0,
            flexShrink: 100,
            overflow: "hidden",
            fontFamily: font.mono,
            fontSize: "0.62em",
            fontWeight: 600,
            letterSpacing: "0.2em",
            textTransform: "uppercase",
            color: color.textDim,
          }}
        >
          Room
        </span>
        <span
          style={{
            flex: "none",
            fontFamily: font.mono,
            fontWeight: 700,
            fontSize: "1.2em",
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
