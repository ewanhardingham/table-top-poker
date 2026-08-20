import type { HandEvent, TableView } from "@table-top-poker/engine";

/**
 * One Replay position as the table may see it. No `Rejection` variant: they
 * are sender-only (#17), and the type enforces that rather than a runtime filter.
 */
export interface TableReplayPosition {
  readonly event: HandEvent | null;
  readonly view: TableView;
}

/** One recorded Hand, whole — no chunking and no pagination. */
export interface HandReplayMessage {
  readonly type: "hand-replay";
  readonly handOrdinal: number;
  readonly positions: readonly TableReplayPosition[];
}
