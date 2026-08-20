import type { HandEvent, TableView } from "@table-top-poker/engine";

/**
 * One position of a replayed Hand as the table may see it: the Event that
 * arrived and the table projection of the state after applying it. Position 0
 * is the starting state and carries `event: null`, mirroring the live
 * `HandUpdateMessage` pairing (Phase 2 spec #129 §5).
 *
 * The pairing is load-bearing rather than convenient: `FoldedOutView` has no
 * board, so a fold-out hand's board is unreachable from a sequence of views
 * alone.
 *
 * There is no `Rejection` variant, and adding one would be a visibility
 * regression: rejections are sender-only and never broadcast (#17), so
 * replaying them to the room would show what the room never saw live. The
 * absence is enforced by this type, not by a runtime filter (§2).
 */
export interface TableReplayPosition {
  readonly event: HandEvent | null;
  readonly view: TableView;
}

/** One recorded Hand, whole — no chunking and no pagination (§5). */
export interface HandReplayMessage {
  readonly type: "hand-replay";
  readonly handOrdinal: number;
  readonly positions: readonly TableReplayPosition[];
}
