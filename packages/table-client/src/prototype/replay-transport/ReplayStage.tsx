/**
 * PROTOTYPE — throwaway, wayfinder ticket #82.
 *
 * The stage is deliberately **shared by every variant**: the same felt, the
 * same live `Seats` and `Board` components, projected at a past position via
 * the real `view(state, "table")`. Only the transport chrome differs between
 * variants, so the comparison isolates the one thing under test.
 *
 * Reusing the live board rendering is itself one of the ticket's questions —
 * this answers it by construction rather than by argument, and whatever
 * breaks is a finding.
 */
import type { SeatView } from "@table-top-poker/protocol";
import { view } from "@table-top-poker/protocol";
import { color, font } from "@table-top-poker/ui-shared";
import { Board } from "../../Board.js";
import { Seats } from "../../Seats.js";
import { fixtureHand, fixtureSeatIds, stateAt } from "./hand.js";

const seats: readonly SeatView[] = fixtureSeatIds.map((id) => ({
  id,
  claimed: true,
  sittingOut: false,
  disconnected: false,
}));

export interface ReplayStageProps {
  readonly position: number;
  /** Caption for the beat just landed on, or null at position 0. */
  readonly caption: string | null;
}

/**
 * The felt at one ordinal. `Board` is mounted with a `key` on the position so
 * its per-card entry animation re-fires as beats land — the animation is the
 * only thing that makes a `BoardDealt` beat read as a deal rather than as
 * three cards that were suddenly always there.
 */
export function ReplayStage({ position, caption }: ReplayStageProps) {
  const tableView = view(stateAt(fixtureHand, position), "table");

  return (
    <>
      <Seats seats={seats} view={tableView} />
      <div
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: "1.2em",
          pointerEvents: "none",
        }}
      >
        <Board key={position} view={tableView} />
      </div>
      {caption !== null && (
        <div
          style={{
            position: "absolute",
            left: "50%",
            bottom: "6.5em",
            transform: "translateX(-50%)",
            fontFamily: font.mono,
            fontSize: "0.7em",
            letterSpacing: "0.14em",
            textTransform: "uppercase",
            color: color.textMuted,
            whiteSpace: "nowrap",
            pointerEvents: "none",
          }}
        >
          {caption}
        </div>
      )}
    </>
  );
}

/** Chrome shared by all three: the replay's identity and the way out. */
export function ReplayHeader({
  position,
  total,
  onClose,
}: {
  readonly position: number;
  readonly total: number;
  readonly onClose: () => void;
}) {
  return (
    <div
      style={{
        position: "absolute",
        top: "1.4em",
        left: "1.8em",
        right: "1.8em",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: "1em",
        zIndex: 3,
      }}
    >
      <span
        style={{
          fontFamily: font.display,
          fontSize: "1.1em",
          color: color.text,
        }}
      >
        Hand {String(fixtureHand.handNumber)}
      </span>
      <span
        style={{
          fontFamily: font.mono,
          fontSize: "0.62em",
          letterSpacing: "0.16em",
          textTransform: "uppercase",
          color: color.textDim,
        }}
      >
        {String(position)} / {String(total)}
      </span>
      <button
        type="button"
        onClick={onClose}
        style={{
          fontFamily: font.mono,
          fontSize: "0.62em",
          letterSpacing: "0.16em",
          textTransform: "uppercase",
          color: color.textDim,
          background: "transparent",
          border: `1px solid ${color.border}`,
          borderRadius: "999px",
          padding: "0.7em 1.3em",
          cursor: "pointer",
        }}
      >
        Back to hands
      </button>
    </div>
  );
}
