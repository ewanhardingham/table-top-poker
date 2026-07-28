import {
  Panel,
  color,
  font,
  fontSize,
  radius,
} from "@table-top-poker/ui-shared";
import type { CSSProperties } from "react";

export interface JoinPanelProps {
  readonly roomCode: string;
  readonly joinUrl: string | null;
  readonly qrCodeDataUrl: string | null;
  readonly lobbyHint: string;
  readonly dismissable: boolean;
  readonly onDismiss: () => void;
}

const overlayStyle: CSSProperties = {
  position: "absolute",
  inset: 0,
  zIndex: 10,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  background: color.overlay,
  // The panel is centred and visually small, but this wrapper spans the
  // whole felt — without this, its invisible edges swallow clicks on
  // whatever sits behind them, like the "Deal hand" control in the
  // bottom-right rail. Only the panel itself should be clickable.
  pointerEvents: "none",
};

const panelStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 38,
  padding: "26px 34px",
  pointerEvents: "auto",
};

const qrPlateStyle: CSSProperties = {
  padding: 14,
  background: color.qrPlate,
  borderRadius: radius.control,
  boxShadow: "0 10px 30px -10px rgba(0,0,0,.7)",
};

const kickerStyle: CSSProperties = {
  fontFamily: font.mono,
  letterSpacing: "0.24em",
  textTransform: "uppercase",
  color: color.textMuted,
};

/**
 * The centred lobby overlay showing the room's QR/code/URL — pinned open
 * while `handView === null`, otherwise toggled by `JoinCodeToggle` and
 * dismissable so the board stays reachable mid-hand.
 */
export function JoinPanel({
  roomCode,
  joinUrl,
  qrCodeDataUrl,
  lobbyHint,
  dismissable,
  onDismiss,
}: JoinPanelProps) {
  return (
    <div style={overlayStyle} data-testid="join-panel">
      <Panel style={panelStyle}>
        <div style={qrPlateStyle}>
          {qrCodeDataUrl && (
            <img
              data-testid="join-panel-qr"
              src={qrCodeDataUrl}
              alt={`Scan to join at ${joinUrl ?? ""}`}
              width={140}
              height={140}
            />
          )}
        </div>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 10,
            alignItems: "flex-start",
          }}
        >
          <span style={{ ...kickerStyle, fontSize: fontSize.sm }}>
            Scan or enter code
          </span>
          <span
            data-testid="join-panel-code"
            style={{
              fontFamily: font.mono,
              fontWeight: 700,
              fontSize: fontSize.jumbo,
              lineHeight: 0.92,
              letterSpacing: "0.1em",
              color: color.text,
              textShadow: "0 4px 30px rgba(229,68,60,.4)",
            }}
          >
            {roomCode}
          </span>
          {joinUrl && (
            <span
              style={{
                fontFamily: font.mono,
                fontSize: fontSize.sm,
                color: color.textFaint,
              }}
            >
              {joinUrl}
            </span>
          )}
          <div
            data-testid="join-panel-hint"
            style={{
              marginTop: 8,
              fontSize: fontSize.md,
              color: color.textDim,
            }}
          >
            {lobbyHint}
          </div>
          {dismissable && (
            <button
              type="button"
              data-testid="join-panel-dismiss"
              onClick={onDismiss}
              style={{
                ...kickerStyle,
                marginTop: 10,
                padding: "12px 22px",
                borderRadius: radius.pill,
                border: `1px solid ${color.border}`,
                background: "transparent",
                fontSize: fontSize.xs,
                fontWeight: 600,
                letterSpacing: "0.18em",
              }}
            >
              Hide
            </button>
          )}
        </div>
      </Panel>
    </div>
  );
}
