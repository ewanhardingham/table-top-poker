import type { ActionType, PlayerView } from "@table-top-poker/protocol";

export function legalActionsFromView(
  view: PlayerView | null,
): readonly ActionType[] {
  return view !== null && view.phase === "betting" ? view.legalActions : [];
}
