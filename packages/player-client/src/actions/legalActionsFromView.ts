import type { ActionType, PlayerView } from "@table-top-poker/protocol";

/**
 * The engine already scopes `PlayerViewBetting.legalActions` to empty
 * unless it's this seat's turn (engine/src/view.ts) — this just extends
 * that to the non-betting phases and the pre-connection `null` view, so
 * callers never branch on `view.phase` themselves.
 */
export function legalActionsFromView(
  view: PlayerView | null,
): readonly ActionType[] {
  return view !== null && view.phase === "betting" ? view.legalActions : [];
}
