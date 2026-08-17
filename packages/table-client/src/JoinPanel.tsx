import {
  Panel,
  color,
  font,
  fontSize,
  radius,
} from "@table-top-poker/ui-shared";
import type { CSSProperties, ReactNode } from "react";

export interface JoinPanelProps {
  readonly roomCode: string;
  readonly joinUrl: string | null;
  readonly qrCodeDataUrl: string | null;
  readonly lobbyHint: string;
  readonly dismissable: boolean;
  readonly onDismiss: () => void;
  readonly controls?: ReactNode;
}

const overlayStyle: CSSProperties = {
  position: "absolute",
  inset: 0,
  zIndex: 10,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  background: color.overlay,
  pointerEvents: "none",
};

const overlayContentStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  gap: "1em",
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

export function JoinPanel({
  roomCode,
  joinUrl,
  qrCodeDataUrl,
  lobbyHint,
  dismissable,
  onDismiss,
  controls,
}: JoinPanelProps) {
  return (
    <div style={overlayStyle} data-testid="join-panel">
      <div style={overlayContentStyle}>
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
        {controls}
      </div>
    </div>
  );
}
