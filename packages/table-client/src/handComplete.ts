import type { TableView } from "@table-top-poker/protocol";

/**
 * HAND_COMPLETE is reached by either terminal `TableView` shape — a
 * fold-out (no reveal) or a showdown (full reveal) — docs/phase-1-spec.md
 * §2. Both are the cue for the table device's "Next hand" button.
 */
export function isHandComplete(view: TableView | null): boolean {
  return view !== null && (view.phase === "folded-out" || view.phase === "showdown");
}
