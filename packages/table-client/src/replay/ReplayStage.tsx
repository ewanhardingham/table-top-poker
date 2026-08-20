import type { SeatView, TableView } from "@table-top-poker/protocol";
import { Board } from "../Board.js";
import { Seats } from "../Seats.js";
import type { SeatActionLabels } from "../actionWords.js";
import { CAPTION_BAND, FELT_LAYER } from "./CaptionStrip.js";

export interface ReplayStageProps {
  readonly view: TableView;
  readonly seats: readonly SeatView[];
  /** Height in `em` of the transport chrome drawn along the bottom. */
  readonly transportHeight: number;
  readonly actionLabels: SeatActionLabels;
}

/**
 * A seat pod is anchored by its avatar and grows *around* that anchor, so a
 * top-row pod carrying a showdown description reaches further up than
 * `posFor`'s 10% and clips the felt's edge. The bottom row overlaps the
 * transport for the mirror reason (Phase 2 spec #129 §6).
 */
export const TOP_BAND = 4.5;

/**
 * The felt at one position of a replayed hand: the live `Seats` and `Board`,
 * fed the position's `view(state, "table")`. No `replay` flag and no parallel
 * rendering path — the visibility guarantee is inherited, not re-implemented.
 *
 * `Board` is deliberately not keyed on the position: it decides for itself
 * which cards have just arrived, so scrubbing does not re-deal all five.
 */
export function ReplayStage({
  view,
  seats,
  transportHeight,
  actionLabels,
}: ReplayStageProps) {
  return (
    <div
      data-testid="replay-stage"
      style={{
        position: "absolute",
        top: `${String(TOP_BAND)}em`,
        left: 0,
        right: 0,
        bottom: `${String(transportHeight + CAPTION_BAND)}em`,
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
