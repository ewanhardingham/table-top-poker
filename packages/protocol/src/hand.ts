import type {
  HandEvent,
  PlayerView,
  RejectionReason,
  TableView,
} from "@table-top-poker/engine";

export interface HandUpdateMessage {
  readonly type: "hand-update";
  readonly event: HandEvent;
  readonly view: PlayerView | TableView;
}

/**
 * A server-rejected command, sender-only. `hand-unavailable` covers every
 * reason a Hand cannot be served; `recording-paused` is a recording failure,
 * not a rule violation, so it never reaches the engine's `RejectionReason`.
 */
export type ServerRejectionReason =
  | "invalid-command"
  | "room-not-found"
  | "not-enough-players"
  | "not-permitted"
  | "hand-unavailable"
  | "recording-paused";

export interface CommandRejectedMessage {
  readonly type: "command-rejected";
  readonly reason: RejectionReason | ServerRejectionReason;
}
