import type { ActionType, SeatId } from "@table-top-poker/protocol";

/** See Action label in `CONTEXT.md`. */
export type SeatActionLabels = ReadonlyMap<SeatId, ActionType>;

/** Past tense, so one word serves both a seat's pill and the Caption. */
export const actionVerb: Record<ActionType, string> = {
  fold: "folded",
  check: "checked",
  call: "called",
  raise: "raised",
};
