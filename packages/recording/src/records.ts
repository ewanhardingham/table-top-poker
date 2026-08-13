import type {
  Command,
  HandEvent,
  Rejection,
  SeatId,
} from "@table-top-poker/engine";

/**
 * The shape of a Room recording *directory* — `room.json`, the Hand context
 * sidecar, the Room ID keying. Deliberately not `ENGINE_LOG_VERSION`, which
 * versions the engine records inside those files and means something else
 * entirely (Phase 2 spec #129 §3, "Version tagging").
 *
 * It appears on `room.json` and nowhere else. A pre-Phase-2 directory is
 * recognised by having no `room.json` at all, not by comparing this number.
 */
export const RECORDING_LAYOUT_VERSION = 1;

/** A recorded command line is the bare `Command` plus a version tag. */
export type RecordedCommand = Command & { readonly v: number };

/** A recorded event line is the bare `HandEvent`/`Rejection` plus a version tag. */
export type RecordedEvent = (HandEvent | Rejection) & { readonly v: number };

/**
 * `room.json`: immutable Room metadata, written once before the Room is
 * joinable. Not a Seat manifest — seat claims, evictions, presence and
 * sitting-out transitions are not separately recorded. `code` is the live
 * four-character join code, or null for a recording (a harness run) that was
 * never joinable through one.
 */
export interface RoomManifest {
  readonly layoutVersion: number;
  readonly roomId: string;
  readonly code: string | null;
  readonly createdAt: string;
}

/**
 * What a caller supplies when its operation starts a Hand. `startedAt` is
 * captured when the operation is *staged*, not when its append confirms —
 * on a stalling disk those are seconds apart, and this timestamp records
 * when the Hand began for the players.
 */
export interface HandStartContext {
  /** ISO 8601, the only clock anywhere in a Room recording. */
  readonly startedAt: string;
  readonly seats: readonly SeatId[];
  readonly button: SeatId;
}

/**
 * `hand-NNNN.context.json`: the bootstrap Replay needs, and nothing more —
 * no cards, no state snapshot. Its presence is what leaves the Command JSONL
 * an exact Command-only stream.
 */
export interface HandContext extends HandStartContext {
  readonly v: number;
  readonly roomId: string;
  readonly handOrdinal: number;
}

/**
 * One complete engine operation: the Command, whatever the engine made of it,
 * and — when this is the operation that starts a Hand — the context that Hand
 * opens with. Callers hand over the whole thing; they never coordinate
 * individual lines.
 */
export interface RoomOperation {
  /** Present only when this operation starts a Hand. */
  readonly context?: HandStartContext;
  readonly command: Command;
  /** The generated Events, or the single Rejection that replaced them. */
  readonly outcome: readonly HandEvent[] | Rejection;
}
