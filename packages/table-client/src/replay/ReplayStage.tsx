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
 * The felt's own margin, top and bottom alike. `posFor` anchors the ring at
 * 10% and 90% and a tabled Hand is dealt towards the Board, so the ring's
 * slack at the felt's edge and the gap it leaves around the Board move
 * together: this is what evens the two out on a felt with room to spare, and
 * falls away to nothing on one without — see `docs/design/replay-layout.md`.
 */
export const EDGE_BAND = "max(0.25rem, 17.68cqh - 7.76rem)";

export const STAGE_TOP = EDGE_BAND;

export const STAGE_BOTTOM = `calc(${EDGE_BAND} + ${TRANSPORT_BAND} + ${CAPTION_BAND})`;

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
        top: STAGE_TOP,
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
