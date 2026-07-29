import type { PlayerView, SeatId, TableView } from "@table-top-poker/engine";
import type { CommandRejectedMessage, HandUpdateMessage } from "./hand.js";

/** A seat's public state — never carries its claim token. */
export interface SeatView {
  readonly id: SeatId;
  readonly claimed: boolean;
  readonly sittingOut: boolean;
  /** Presence-only badge (ticket 33 §7) — never affects folding or legal actions. */
  readonly disconnected: boolean;
}

export interface RoomView {
  readonly code: string;
  readonly seats: readonly SeatView[];
}

/** Pushed over the room's WebSocket whenever seat state changes. */
export interface RoomViewMessage {
  readonly type: "room-view";
  readonly view: RoomView;
}

/** Sent to a player's socket immediately before the server closes it after eviction. */
export interface PlayerEvictedMessage {
  readonly type: "player-evicted";
}

/**
 * Pushed once, right after a socket opens (fresh join or reconnect), when a
 * hand is already in progress — a snapshot only, never replayed events
 * (docs/phase-1-spec.md §7, §9).
 */
export interface ViewSnapshotMessage {
  readonly type: "view-snapshot";
  readonly view: PlayerView | TableView;
}

/**
 * Pushed to every socket in a room when it ends — manual "End session" or
 * the table device's own 60s reconnect grace window elapsing (§7). Both
 * paths discard in-memory state the same way.
 */
export interface RoomEndedMessage {
  readonly type: "room-ended";
}

export type ServerMessage =
  | RoomViewMessage
  | PlayerEvictedMessage
  | HandUpdateMessage
  | CommandRejectedMessage
  | ViewSnapshotMessage
  | RoomEndedMessage;
