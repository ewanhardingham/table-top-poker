import type { HandEvent, TableView } from "@table-top-poker/engine";

/**
 * One Replay position as the table may see it, pairing the Event with the
 * table projection of the state after applying it — `FoldedOutView` carries
 * no board, so a fold-out Hand's board is unreachable from views alone
 * (Phase 2 spec #129 §5). Position 0 carries `event: null`.
 *
 * There is deliberately no `Rejection` variant: rejections are sender-only
 * and never broadcast (#17), and the absence is enforced by this type rather
 * than by a runtime filter someone could forget.
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
