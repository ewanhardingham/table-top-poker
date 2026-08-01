import type {
  HandEvent,
  PlayerView,
  RejectionReason,
  TableView,
} from "@table-top-poker/engine";

/**
 * Pushed once per domain event produced by a command, to every socket
 * entitled to see it. Carries both the raw event (future audit/animation)
 * and a fresh per-recipient view — the view is source of truth
 * (Phase 1 spec #130 §6), the event is not replayed against local state.
 */
export interface HandUpdateMessage {
  readonly type: "hand-update";
  readonly event: HandEvent;
  readonly view: PlayerView | TableView;
}

/** A server-rejected command, reason-coded, delivered to the sender only. */
export type ServerRejectionReason =
  "invalid-command" | "room-not-found" | "not-enough-players" | "not-permitted";

export interface CommandRejectedMessage {
  readonly type: "command-rejected";
  readonly reason: RejectionReason | ServerRejectionReason;
}
