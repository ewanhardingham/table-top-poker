import {
  MAX_DISPLAY_NAME_LENGTH,
  type SeatView,
} from "@table-top-poker/protocol";
import { color, font, fontSize, radius } from "@table-top-poker/ui-shared";
import { useEffect, useState, type CSSProperties } from "react";
import { InlineError } from "./InlineError.js";

export interface SeatPickerProps {
  readonly seats: readonly SeatView[];
  readonly error: string | null;
  readonly evictionMessage?: string | null;
  readonly onClaim: (seatId: number, displayName: string) => void;
}

const seatErrorCopy: Record<string, string> = {
  "room-not-found":
    "That room is no longer available — return to the join screen.",
  "seat-not-found": "That seat is no longer available — pick another.",
  "seat-already-claimed": "Someone just took that seat — pick another.",
  "duplicate-display-name": "That name is already taken — choose another.",
  "invalid-display-name": "Enter a name with 1–10 characters.",
  "claim-failed": "Couldn't reach the table — try that seat again.",
};

/**
 * Why a pending seat selection can no longer be claimed, or null while it
 * still can. A live room view can take the seat or repack it out of the table
 * between selecting it and claiming it.
 */
export function selectionLostMessage(
  seatId: number,
  seat: SeatView | undefined,
): string | null {
  if (seat === undefined) {
    return `Seat ${String(seatId + 1)} is no longer at this table — pick another.`;
  }
  if (seat.claimed) {
    return `Seat ${String(seatId + 1)} was just taken — pick another.`;
  }
  return null;
}

const descriptionStyle: CSSProperties = {
  fontSize: fontSize.md,
  lineHeight: 1.5,
  color: color.textMuted,
};

type SeatGridStyle = CSSProperties & {
  readonly "--seat-row-count": number;
};

function seatGridStyle(seatCount: number): SeatGridStyle {
  const rowCount = Math.max(1, Math.ceil(seatCount / 2));

  // Row count and column count are data, so they stay inline; the grid's
  // sizing and shrink behaviour live in the `.seat-grid` CSS rule.
  return {
    "--seat-row-count": rowCount,
    gridTemplateColumns: seatCount <= 1 ? "1fr" : "repeat(2, minmax(0, 1fr))",
  };
}

function seatStyle(claimed: boolean, selected: boolean): CSSProperties {
  return {
    borderRadius: radius.control,
    ...(claimed
      ? {
          border: `1px solid ${color.border}`,
          background: color.mutedSurface,
          opacity: 0.5,
        }
      : {
          border: `1px solid ${
            selected ? color.accentBright : color.accentBorder
          }`,
          // Selection is carried by the brighter border and the ring, not by
          // a fill: `lossBackground` is the error surface this same screen
          // uses below, and a selected seat is not an error.
          background: color.accentWash,
          boxShadow: selected ? `0 0 0 2px ${color.accentBorder}` : undefined,
        }),
  };
}

function avatarStyle(claimed: boolean): CSSProperties {
  return {
    borderRadius: radius.pill,
    flex: "none",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontFamily: font.mono,
    fontWeight: 700,
    fontSize: fontSize.sm,
    background: color.avatarGradient,
    color: color.pillInk,
    filter: claimed ? "saturate(.2) brightness(.7)" : undefined,
  };
}

const textColStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 2,
  width: "100%",
  minWidth: 0,
};

const titleStyle: CSSProperties = {
  fontSize: fontSize.md,
  fontWeight: 600,
  color: color.text,
};

const seatTitleStyle: CSSProperties = {
  ...titleStyle,
  fontSize: fontSize.lg,
  lineHeight: 1.15,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
};

const subStyle: CSSProperties = {
  fontFamily: font.mono,
  fontSize: fontSize.xs,
  letterSpacing: "0.14em",
  textTransform: "uppercase",
  color: color.textDim,
  lineHeight: 1.1,
};

const nameEntryStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 12,
  padding: "15px 16px 16px",
  border: `1px solid ${color.accentBorder}`,
  borderRadius: radius.control,
  background: color.accentWash,
};

const inputStyle: CSSProperties = {
  width: "100%",
  padding: "11px 12px",
  border: `1px solid ${color.borderStrong}`,
  borderRadius: radius.control,
  outline: "none",
  color: color.text,
  font: "inherit",
  fontSize: fontSize.md,
  background: color.control,
};

const claimButtonStyle: CSSProperties = {
  border: 0,
  borderRadius: radius.pill,
  padding: "13px 17px",
  color: color.pillInk,
  font: "inherit",
  fontWeight: 700,
  background: color.pillGradient,
};

export function SeatPicker({
  seats,
  error,
  evictionMessage,
  onClaim,
}: SeatPickerProps) {
  const [selectedSeatId, setSelectedSeatId] = useState<number | null>(null);
  const [displayName, setDisplayName] = useState("");
  const [selectionLost, setSelectionLost] = useState<string | null>(null);
  const selectedSeat =
    selectedSeatId === null
      ? undefined
      : seats.find((seat) => seat.id === selectedSeatId);
  const canClaim =
    selectedSeat !== undefined &&
    !selectedSeat.claimed &&
    displayName.trim() !== "";

  // Room views now arrive live over the lobby socket, so the selected seat can
  // be claimed by someone else or repacked away while this player is still
  // typing. Drop the selection and say why — the typed name is deliberately
  // kept, so picking another seat doesn't mean typing it again.
  useEffect(() => {
    if (selectedSeatId === null) return;
    const lost = selectionLostMessage(selectedSeatId, selectedSeat);
    if (lost === null) return;
    setSelectionLost(lost);
    setSelectedSeatId(null);
  }, [selectedSeat, selectedSeatId]);

  return (
    <div
      data-testid="seat-picker"
      style={{
        flex: 1,
        minHeight: 0,
        overflow: "auto",
        display: "flex",
        flexDirection: "column",
        gap: 12,
        padding: "0 22px 26px",
      }}
    >
      <div style={descriptionStyle}>
        Pick where you're sitting. Seat order sets the button and blinds.
      </div>
      <div
        className="seat-grid"
        data-testid="seat-grid"
        data-seat-count={seats.length}
        style={seatGridStyle(seats.length)}
      >
        {seats.map((seat) => {
          const selected = selectedSeatId === seat.id;
          const content = (
            <>
              <span className="seat-avatar" style={avatarStyle(seat.claimed)}>
                {seat.id + 1}
              </span>
              <span style={textColStyle}>
                <span style={seatTitleStyle}>
                  {seat.claimed
                    ? (seat.displayName ?? `Seat ${String(seat.id + 1)}`)
                    : `Seat ${String(seat.id + 1)}`}
                </span>
                <span style={subStyle}>
                  {seat.claimed ? "Taken" : selected ? "Selected" : "Sit here"}
                </span>
              </span>
            </>
          );
          return (
            <div
              key={seat.id}
              className="seat-option"
              data-testid={`seat-option-${String(seat.id)}`}
              style={seatStyle(seat.claimed, selected)}
            >
              {seat.claimed ? (
                <div className="seat-row">{content}</div>
              ) : (
                <button
                  type="button"
                  className="seat-row"
                  data-testid={`claim-seat-${String(seat.id)}`}
                  onClick={() => {
                    setSelectionLost(null);
                    setSelectedSeatId(seat.id);
                  }}
                  aria-pressed={selected}
                >
                  {content}
                </button>
              )}
            </div>
          );
        })}
      </div>
      {selectedSeat !== undefined && !selectedSeat.claimed && (
        <div data-testid="name-entry" style={nameEntryStyle}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              gap: 12,
            }}
          >
            <div style={textColStyle}>
              <span style={subStyle}>Seat selected</span>
              <strong style={titleStyle}>Seat {selectedSeat.id + 1}</strong>
            </div>
            <span style={subStyle}>Name required</span>
          </div>
          <label style={{ ...textColStyle, gap: 6 }}>
            <span style={{ ...subStyle, letterSpacing: "0.12em" }}>
              Display name
            </span>
            <input
              data-testid="display-name-input"
              value={displayName}
              required
              aria-required="true"
              maxLength={MAX_DISPLAY_NAME_LENGTH}
              placeholder="e.g. Hasbulla"
              onChange={(event) => {
                setDisplayName(event.target.value);
              }}
              style={inputStyle}
            />
          </label>
          <button
            type="button"
            data-testid="confirm-claim-seat"
            disabled={!canClaim}
            onClick={() => {
              if (!canClaim) return;
              onClaim(selectedSeat.id, displayName.trim());
            }}
            style={{
              ...claimButtonStyle,
              opacity: canClaim ? 1 : 0.45,
              cursor: canClaim ? "pointer" : "not-allowed",
            }}
          >
            Claim Seat {selectedSeat.id + 1}
          </button>
        </div>
      )}
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
      {selectionLost !== null && (
        <InlineError testId="selection-lost" message={selectionLost} />
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
