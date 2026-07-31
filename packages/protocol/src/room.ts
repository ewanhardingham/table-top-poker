import type { PlayerView, SeatId, TableView } from "@table-top-poker/engine";
import { z } from "zod";
import type { CommandRejectedMessage, HandUpdateMessage } from "./hand.js";

/**
 * How many seats a room may be created with (issue #74). Two is the
 * smallest table a hand can be dealt at — heads-up; eight is the physical
 * limit the felt is laid out for. The creator picks a size in this range
 * per room; it is not a global constant.
 */
export const MIN_SEAT_COUNT = 2;
export const MAX_SEAT_COUNT = 8;
/** What the picker starts on, and the size a room gets absent any choice — a full table. */
export const DEFAULT_SEAT_COUNT = MAX_SEAT_COUNT;

/**
 * The one definition of "a size a room may have". Both the HTTP edge and
 * `RoomStore.create` parse through it, so the range can never drift
 * between the wire and the store.
 */
export const SeatCountSchema = z.int().min(MIN_SEAT_COUNT).max(MAX_SEAT_COUNT);

/**
 * Body of `POST /rooms`. The seat count crosses an untrusted boundary, so
 * the bounds live here rather than in the picker UI — the server parses
 * with this schema and the table client shares its range.
 */
export const CreateRoomRequestSchema = z.strictObject({
  seatCount: SeatCountSchema,
});

export type CreateRoomRequest = z.infer<typeof CreateRoomRequestSchema>;

/** Body of the table-only room settings request (issue #77). */
export const ChangeSeatCountRequestSchema = z.strictObject({
  seatCount: SeatCountSchema,
});

export type ChangeSeatCountRequest = z.infer<
  typeof ChangeSeatCountRequestSchema
>;

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
  /** A shrink requested during a live hand, applied at the next deal-in. */
  readonly pendingSeatCount?: number;
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

/** Pushed to a player when a table shrink renumbers their claimed seat. */
export interface SeatMovedMessage {
  readonly type: "seat-moved";
  readonly from: SeatId;
  readonly to: SeatId;
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
  | SeatMovedMessage
  | HandUpdateMessage
  | CommandRejectedMessage
  | ViewSnapshotMessage
  | RoomEndedMessage;
