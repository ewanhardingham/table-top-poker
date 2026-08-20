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
 * `hand-unavailable` answers a `get-hand` for an ordinal this Room cannot
 * serve — never recorded, incomplete, or disagreeing with its own audit
 * stream. One reason covers all three: which it was is filesystem detail, and
 * that stays in operational server logs (Phase 2 spec #129 §3).
 *
 * `recording-paused` answers a command a paused Room cannot record — a
 * recording failure, not a rule violation, so it lives here and never
 * reaches the engine's own `RejectionReason` (§3).
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
