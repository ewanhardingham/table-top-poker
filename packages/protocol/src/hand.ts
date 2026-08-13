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
 * A server-rejected command, reason-coded, delivered to the sender only.
 *
 * `replay-not-supported` answers a well-formed replay request this server
 * cannot serve yet, so a client can tell "not built" from a dropped socket.
 * It retires when the Replay read path lands.
 */
export type ServerRejectionReason =
  | "invalid-command"
  | "room-not-found"
  | "not-enough-players"
  | "not-permitted"
  | "replay-not-supported";

export interface CommandRejectedMessage {
  readonly type: "command-rejected";
  readonly reason: RejectionReason | ServerRejectionReason;
}
