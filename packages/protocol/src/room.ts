import type {
  EngineState,
  PlayerView,
  SeatId,
  TableView,
} from "@table-top-poker/engine";
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
/** Maximum display-name length accepted during a seat claim. */
export const MAX_DISPLAY_NAME_LENGTH = 10;

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

/** Body of a player's required display-name seat claim. */
export const ClaimSeatRequestSchema = z.strictObject({
  displayName: z.string().trim().min(1).max(MAX_DISPLAY_NAME_LENGTH),
});

export type ClaimSeatRequest = z.infer<typeof ClaimSeatRequestSchema>;

/** Body of the test-mode table action that fills free seats with bots. */
export const AddBotsRequestSchema = z.strictObject({
  count: z.int().nonnegative(),
});

export type AddBotsRequest = z.infer<typeof AddBotsRequestSchema>;

/** Body of a player releasing their own seat (ADR-0005) — the seat's token. */
export const LeaveSeatRequestSchema = z.strictObject({
  token: z.string().min(1),
});

export type LeaveSeatRequest = z.infer<typeof LeaveSeatRequestSchema>;

/** Body of the table-only room settings request (issue #77). */
export const ChangeSeatCountRequestSchema = z.strictObject({
  seatCount: SeatCountSchema,
});

export type ChangeSeatCountRequest = z.infer<
  typeof ChangeSeatCountRequestSchema
>;

/** Errors returned by the table device's seat-count settings route. */
export type SeatCountChangeError =
  | "room-not-found"
  | "invalid-request-body"
  | "invalid-seat-count"
  | "seat-count-below-floor";

/**
 * The room-wide tactile-sound settings (#182), owned by the table and pushed to
 * every surface on `room-view`. `sounds` is the master switch; `cards`,
 * `actions` and `notifications` are the three cue categories under it (cards =
 * the tactile card foley — deal, board, flip; actions = player actions —
 * fold, check; notifications = the your-turn prompt). A cue plays only when the
 * master and its category are both on. Phones hold no local override in this
 * cut — they obey these settings verbatim.
 */
export interface SoundSettings {
  readonly sounds: boolean;
  readonly cards: boolean;
  readonly actions: boolean;
  readonly notifications: boolean;
}

/** A fresh room starts fully audible. */
export const DEFAULT_SOUND_SETTINGS: SoundSettings = {
  sounds: true,
  cards: true,
  actions: true,
  notifications: true,
};

/**
 * Body of the table-only sound-settings request (#182). The whole set is
 * sent every time, so the master and all categories stay a single atomic
 * write — no partial-update ordering to reason about.
 */
export const ChangeSoundSettingsRequestSchema = z.strictObject({
  sounds: z.boolean(),
  cards: z.boolean(),
  actions: z.boolean(),
  notifications: z.boolean(),
});

export type ChangeSoundSettingsRequest = z.infer<
  typeof ChangeSoundSettingsRequestSchema
>;

/** Errors returned by the table device's sound-settings route. */
export type SoundSettingsChangeError =
  "room-not-found" | "invalid-request-body";

/** Inclusive bounds for a room's player action timer. */
export const MIN_SHOT_CLOCK_SECONDS = 5;
export const MAX_SHOT_CLOCK_SECONDS = 600;

/** A room-owned player action timer configuration. */
export interface ShotClockSettings {
  readonly enabled: boolean;
  readonly seconds: number;
}

/** A fresh room has an unbounded action clock, with 90 seconds ready to enable. */
export const DEFAULT_SHOT_CLOCK: ShotClockSettings = {
  enabled: false,
  seconds: 90,
};

/** The single trust-boundary definition for shot-clock settings. */
export const ShotClockSettingsSchema = z.strictObject({
  enabled: z.boolean(),
  seconds: z.int().min(MIN_SHOT_CLOCK_SECONDS).max(MAX_SHOT_CLOCK_SECONDS),
});

/** The sources from which a client or server can answer whether a hand is live. */
export type HandStateSource = EngineState | PlayerView | TableView | null;

export function isHandLive(source: HandStateSource): boolean {
  if (source === null) return false;
  return "phase" in source
    ? source.phase === "betting"
    : source.hand?.status === "betting";
}

export function isHandComplete(source: HandStateSource): boolean {
  if (source === null) return false;
  return "phase" in source
    ? source.phase === "folded-out" || source.phase === "showdown"
    : source.hand?.status === "complete";
}

export interface SeatMove {
  readonly from: SeatId;
  readonly to: SeatId;
}

/** Why a claimed seat is currently absent from the next deal-in. */
export type SittingOutReason = "voluntary" | "waiting-for-next-hand";

export interface SeatCountChange {
  readonly seatCount: number;
  readonly pendingSeatCount: number | null;
  readonly applied: boolean;
  readonly moves: readonly SeatMove[];
}

/** A seat's public state — never carries its claim token. */
export interface SeatView {
  readonly id: SeatId;
  readonly claimed: boolean;
  /** The required display name for newer claims; absent on pre-name seats. */
  readonly displayName?: string | null;
  /** Present only for test-mode bot seats. */
  readonly bot?: boolean;
  readonly sittingOut: boolean;
  /** Why a claimed seat is absent from the current/next deal-in. */
  readonly sittingOutReason: SittingOutReason | null;
  /** Presence-only badge (ticket 33 §7) — never affects folding or legal actions. */
  readonly disconnected: boolean;
}

/**
 * Whether a seat joins the next deal-in — the client-side mirror of the
 * server's `eligibleSeats` (ADR-0002): claimed, connected, and not
 * voluntarily sitting out. A `waiting-for-next-hand` seat sets `sittingOut`
 * on the view but *is* dealt in next hand, so the reason, not the flag, is
 * what excludes a seat here.
 */
export function isDealtInNextHand(seat: SeatView): boolean {
  return (
    seat.claimed && !seat.disconnected && seat.sittingOutReason !== "voluntary"
  );
}

/** How many seats the next `startHand`/`nextHand` would deal in. */
export function countDealInSeats(seats: readonly SeatView[]): number {
  return seats.filter(isDealtInNextHand).length;
}

export interface RoomView {
  readonly code: string;
  readonly seats: readonly SeatView[];
  /** A shrink queued until the next deal-in, or null when none is queued. */
  readonly pendingSeatCount: number | null;
  /** Room-wide tactile-sound settings (#182), replayed on join/reconnect. */
  readonly soundSettings: SoundSettings;
  /** Room-wide action-clock settings, replayed on join/reconnect. */
  readonly shotClockSettings: ShotClockSettings;
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
export interface SeatMovedMessage extends SeatMove {
  readonly type: "seat-moved";
}

/**
 * Pushed once, right after a socket opens (fresh join or reconnect), when a
 * hand is already in progress — a snapshot only, never replayed events
 * (Phase 1 spec #130 §7, §9).
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
