import type { SeatView, TableView } from "@table-top-poker/protocol";
import { Board } from "../Board.js";
import { Seats } from "../Seats.js";
import type { SeatActionLabels } from "../actionWords.js";
import { CAPTION_BAND, FELT_LAYER } from "./CaptionStrip.js";
import { TRANSPORT_BAND } from "./ReplayTransport.js";

export interface ReplayStageProps {
  readonly view: TableView;
  readonly seats: readonly SeatView[];
  readonly actionLabels: SeatActionLabels;
}

/**
 * A pod grows around its avatar anchor, so it reaches past `posFor`'s 10%.
 * Measured in root units, like the pod it clears, rather than in the chrome's.
 */
export const TOP_BAND = 4;

/** The mirror of {@link TOP_BAND}: what the bottom row needs to clear the Caption. */
export const BOTTOM_BAND = TOP_BAND;

/**
 * The pod's clearance in root units and the chrome's in its own, so the felt
 * keeps the room the chrome gives back as it shrinks — see `chrome.ts`.
 */
export const STAGE_BOTTOM = `calc(${String(BOTTOM_BAND)}em + ${TRANSPORT_BAND} + ${CAPTION_BAND})`;

/**
 * The live `Seats` and `Board` fed one replay position — no parallel rendering
 * path, so the visibility guarantee is inherited. `Board` is deliberately not
 * keyed on the position: scrubbing must not re-deal all five cards.
 */
export function ReplayStage({ view, seats, actionLabels }: ReplayStageProps) {
  return (
    <div
      data-testid="replay-stage"
      style={{
        position: "absolute",
        top: `${String(TOP_BAND)}em`,
        left: 0,
        right: 0,
        bottom: STAGE_BOTTOM,
        zIndex: FELT_LAYER,
      }}
    >
      <Seats seats={seats} view={view} actionLabels={actionLabels} />
      <div
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          pointerEvents: "none",
        }}
      >
        <Board view={view} seats={seats} />
      </div>
    </div>
  );
}
