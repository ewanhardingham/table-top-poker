import type {
  Command,
  HandEvent,
  Rejection,
  SeatId,
} from "@table-top-poker/engine";

/** Versions the recording directory — see Recording in `docs/design/server.md`. */
export const RECORDING_LAYOUT_VERSION = 1;

export type RecordedCommand = Command & { readonly v: number };

export type RecordedEvent = (HandEvent | Rejection) & { readonly v: number };

/** `room.json` — see Room recording in `CONTEXT.md`. */
export interface RoomManifest {
  readonly layoutVersion: number;
  readonly roomId: string;
  /** The live join code, or null for a recording never joinable through one. */
  readonly code: string | null;
  readonly createdAt: string;
}

export interface HandStartContext {
  /** Captured when the operation is staged, not when its append confirms. */
  readonly startedAt: string;
  readonly seats: readonly SeatId[];
  readonly button: SeatId;
}

/** `hand-NNNN.context.json` — see Hand context in `CONTEXT.md`. */
export interface HandContext extends HandStartContext {
  readonly v: number;
  readonly roomId: string;
  readonly handOrdinal: number;
}

/** One complete engine operation, handed over whole. */
export interface RoomOperation {
  /** Present only when this operation starts a Hand. */
  readonly context?: HandStartContext;
  readonly command: Command;
  /** The generated Events, or the single Rejection that replaced them. */
  readonly outcome: readonly HandEvent[] | Rejection;
}
