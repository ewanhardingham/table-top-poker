import type { SeatView } from "@table-top-poker/protocol";
import { color, font, fontSize, radius } from "@table-top-poker/ui-shared";
import type { CSSProperties } from "react";
import { InlineError } from "./InlineError.js";

export interface SeatPickerProps {
  readonly seats: readonly SeatView[];
  readonly error: string | null;
  readonly evictionMessage?: string | null;
  readonly onClaim: (seatId: number) => void;
}

const seatErrorCopy: Record<string, string> = {
  "seat-already-claimed": "Someone just took that seat — pick another.",
};

const descriptionStyle: CSSProperties = {
  fontSize: fontSize.md,
  lineHeight: 1.5,
  color: color.textMuted,
};

const gridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1fr 1fr",
  gap: 10,
};

function seatStyle(claimed: boolean): CSSProperties {
  return {
    borderRadius: radius.control,
    padding: "14px 13px",
    ...(claimed
      ? {
          border: `1px solid ${color.border}`,
          background: color.mutedSurface,
          opacity: 0.5,
        }
      : {
          border: `1px solid ${color.accentBorder}`,
          background: color.accentWash,
        }),
  };
}

const rowStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 11,
  width: "100%",
  textAlign: "left",
  background: "none",
  border: 0,
  padding: 0,
  font: "inherit",
  color: "inherit",
  cursor: "pointer",
};

function avatarStyle(claimed: boolean): CSSProperties {
  return {
    width: 34,
    height: 34,
    borderRadius: radius.pill,
    flex: "none",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontFamily: font.mono,
    fontWeight: 700,
    fontSize: fontSize.xs,
    background: color.avatarGradient,
    color: color.pillInk,
    filter: claimed ? "saturate(.2) brightness(.7)" : undefined,
  };
}

const textColStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 2,
  minWidth: 0,
};

const titleStyle: CSSProperties = {
  fontSize: fontSize.md,
  fontWeight: 600,
  color: color.text,
};

const subStyle: CSSProperties = {
  fontFamily: font.mono,
  fontSize: fontSize.xs,
  letterSpacing: "0.14em",
  textTransform: "uppercase",
  color: color.textDim,
};

export function SeatPicker({
  seats,
  error,
  evictionMessage,
  onClaim,
}: SeatPickerProps) {
  return (
    <div
      data-testid="seat-picker"
      style={{
        flex: 1,
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
        gap: 14,
        padding: "0 22px 26px",
      }}
    >
      <div style={descriptionStyle}>
        Pick where you're sitting. Seat order sets the button and blinds.
      </div>
      <div style={gridStyle}>
        {seats.map((seat) => {
          const content = (
            <>
              <span style={avatarStyle(seat.claimed)}>{seat.id + 1}</span>
              <span style={textColStyle}>
                <span style={titleStyle}>Seat {seat.id + 1}</span>
                <span style={subStyle}>
                  {seat.claimed ? "Taken" : "Sit here"}
                </span>
              </span>
            </>
          );
          return (
            <div
              key={seat.id}
              data-testid={`seat-option-${String(seat.id)}`}
              style={seatStyle(seat.claimed)}
            >
              {seat.claimed ? (
                <div style={rowStyle}>{content}</div>
              ) : (
                <button
                  type="button"
                  data-testid={`claim-seat-${String(seat.id)}`}
                  onClick={() => {
                    onClaim(seat.id);
                  }}
                  style={rowStyle}
                >
                  {content}
                </button>
              )}
            </div>
          );
        })}
      </div>
      {evictionMessage && (
        <div
          data-testid="eviction-message"
          style={{
            padding: "14px 16px",
            border: `1px solid ${color.accent}`,
            borderRadius: radius.control,
            background: color.lossBackground,
            color: color.textBright,
            fontFamily: font.display,
            fontSize: fontSize.lg,
            fontWeight: 800,
            lineHeight: 1.25,
            textAlign: "center",
          }}
        >
          {evictionMessage}
        </div>
      )}
      {error && (
        <InlineError
          testId="claim-error"
          message={seatErrorCopy[error] ?? error}
        />
      )}
    </div>
  );
}
