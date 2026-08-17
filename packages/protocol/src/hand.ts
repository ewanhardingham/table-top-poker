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

export type ServerRejectionReason =
  "invalid-command" | "room-not-found" | "not-enough-players" | "not-permitted";

export interface CommandRejectedMessage {
  readonly type: "command-rejected";
  readonly reason: RejectionReason | ServerRejectionReason;
}
