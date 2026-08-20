import type {
  ActionType,
  SeatId,
  Street,
  TableReplayPosition,
} from "@table-top-poker/protocol";
import { streetOf } from "./beats.js";

/** What each seat has done on the street now on the felt. */
export type SeatActionLabels = ReadonlyMap<SeatId, ActionType>;

/**
 * The seats' actions folded back out of the Event stream: `TableViewBetting`
 * carries only `folded`, so the view at a position cannot say who called
 * (Phase 2 spec #129 §6). Labels clear on the same street change the Chapters
 * anchor to, which is the street's `BoardDealt` — once the turn is out, "Seat
 * 4 called" is about a street nobody is looking at.
 */
export function actionLabelsAt(
  positions: readonly TableReplayPosition[],
  position: number,
): SeatActionLabels {
  const labels = new Map<SeatId, ActionType>();
  let street: Street | null = null;

  for (const { event } of positions.slice(1, position + 1)) {
    if (event === null) continue;
    const next = streetOf(event, street);
    if (next !== street) labels.clear();
    street = next;
    if (event.type === "ActionTaken") labels.set(event.seatId, event.action);
  }
  return labels;
}
