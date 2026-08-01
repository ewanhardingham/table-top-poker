import {
  Panel,
  PillButton,
  color,
  font,
  fontSize,
} from "@table-top-poker/ui-shared";
import { posFor } from "./table/posFor.js";

export interface SeatMenuProps {
  readonly seatId: number;
  readonly seatCount: number;
  readonly displayName?: string | null;
  readonly onEvict: () => void;
  readonly onDismiss: () => void;
}

/**
 * The table device's manual seat action (ADR-0003) — click a claimed seat,
 * this pops up next to it with the one action currently available: Evict.
 * A full-screen backdrop dismisses it without acting, same as the join
 * panel's own dismiss pattern.
 */
export function SeatMenu({
  seatId,
  seatCount,
  displayName,
  onEvict,
  onDismiss,
}: SeatMenuProps) {
  const pos = posFor(seatId, seatCount);
  const isTopRow = pos.top < 50;

  return (
    <>
      <div
        data-testid="seat-menu-backdrop"
        onClick={onDismiss}
        style={{ position: "absolute", inset: 0, zIndex: 9 }}
      />
      <Panel
        data-testid={`seat-menu-${String(seatId)}`}
        style={{
          position: "absolute",
          left: `${String(pos.left)}%`,
          top: `${String(isTopRow ? pos.top + 16 : pos.top - 16)}%`,
          transform: "translate(-50%, -50%)",
          padding: "0.7em",
          display: "flex",
          flexDirection: "column",
          gap: "0.5em",
          zIndex: 10,
        }}
      >
        <div
          style={{
            fontFamily: font.mono,
            fontSize: fontSize.xs,
            letterSpacing: "0.1em",
            textTransform: "uppercase",
            color: color.textMuted,
            padding: "0 0.2em",
          }}
        >
          {displayName ? `${displayName} · ` : ""}Seat {seatId + 1}
        </div>
        <PillButton
          data-testid={`evict-seat-${String(seatId)}-button`}
          tone="outline"
          onClick={onEvict}
          style={{
            padding: "10px 20px",
            fontSize: fontSize.xs,
            color: color.accentBright,
            borderColor: color.lossBorder,
            background: color.lossBackground,
          }}
        >
          Evict
        </PillButton>
      </Panel>
    </>
  );
}
