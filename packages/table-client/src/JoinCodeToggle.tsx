import { color, font, fontSize, radius } from "@table-top-poker/ui-shared";
import type { CSSProperties } from "react";

export interface JoinCodeToggleProps {
  readonly roomCode: string;
  readonly onOpen: () => void;
}

/*
 * Shrinkable rather than fixed, so a narrow table screen squeezes this pill
 * instead of pushing the connection badge off the edge (ADR-0006). The
 * `min-width: 0` is on the wrapper, never on the button — the button's own
 * automatic minimum is what stops the room code being painted outside its
 * border.
 */
const wrapperStyle: CSSProperties = {
  flex: "0 1 auto",
  minWidth: 0,
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
  overflow: "hidden",
};

/**
 * Room pill in the status bar, letting the table device peek at the join
 * code/QR mid-hand without losing the board view.
 *
 * It opens the join card but never closes it: `App` unmounts the pill while
 * the card is up, so the card's own Hide button is the single close path. A
 * pill that could also close would need a second label and a second state for
 * a control that is off-screen whenever that state applies.
 */
export function JoinCodeToggle({ roomCode, onOpen }: JoinCodeToggleProps) {
  return (
    <div style={wrapperStyle}>
      <button
        type="button"
        data-testid="join-code-toggle"
        onClick={onOpen}
        style={buttonStyle}
      >
        {/* The kicker yields first: it labels the pill, whereas the code is
         * the thing a player has to read off the screen to join. */}
        <span
          style={{
            minWidth: 0,
            flexShrink: 100,
            overflow: "hidden",
            fontFamily: font.mono,
            fontSize: fontSize.xs,
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
