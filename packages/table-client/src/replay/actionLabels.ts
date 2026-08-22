import type {
  ActionType,
  SeatId,
  Street,
  TableReplayPosition,
} from "@table-top-poker/protocol";
import type { SeatActionLabels } from "../actionWords.js";
import { streetOf } from "./beats.js";

/** The Action labels at one position — see Action label in `CONTEXT.md`. */
export function actionLabelsAt(
  positions: readonly TableReplayPosition[],
  position: number,
): SeatActionLabels {
  const labels = new Map<SeatId, ActionType>();
  let street: Street | null = null;

  for (const { event } of positions.slice(1, position + 1)) {
    if (event === null) continue;
    if (event.type === "ShowdownReached" || event.type === "HandFoldedOut") {
      labels.clear();
      continue;
    }
    const next = streetOf(event, street);
    if (next !== street) labels.clear();
    street = next;
    if (event.type === "ActionTaken") labels.set(event.seatId, event.action);
  }
  return labels;
}
