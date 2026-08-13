import type {
  EngineState,
  PlayerView,
  SeatId,
  TableView,
} from "@table-top-poker/engine";
import { z } from "zod";
import type { CommandRejectedMessage, HandUpdateMessage } from "./hand.js";
import type { HandSummary } from "./summary.js";

export const MIN_SEAT_COUNT = 2;
export const MAX_SEAT_COUNT = 8;
export const DEFAULT_SEAT_COUNT = MAX_SEAT_COUNT;
export const MAX_DISPLAY_NAME_LENGTH = 10;

export const SeatCountSchema = z.int().min(MIN_SEAT_COUNT).max(MAX_SEAT_COUNT);

export const CreateRoomRequestSchema = z.strictObject({
  seatCount: SeatCountSchema,
});

export type CreateRoomRequest = z.infer<typeof CreateRoomRequestSchema>;

export const ClaimSeatRequestSchema = z.strictObject({
  displayName: z.string().trim().min(1).max(MAX_DISPLAY_NAME_LENGTH),
});

export type ClaimSeatRequest = z.infer<typeof ClaimSeatRequestSchema>;

export const AddBotsRequestSchema = z.strictObject({
  count: z.int().nonnegative(),
});

export type AddBotsRequest = z.infer<typeof AddBotsRequestSchema>;

export const LeaveSeatRequestSchema = z.strictObject({
  token: z.string().min(1),
});

export type LeaveSeatRequest = z.infer<typeof LeaveSeatRequestSchema>;

export const ChangeSeatCountRequestSchema = z.strictObject({
  seatCount: SeatCountSchema,
});

export type ChangeSeatCountRequest = z.infer<
  typeof ChangeSeatCountRequestSchema
>;

export type SeatCountChangeError =
  | "room-not-found"
  | "invalid-request-body"
  | "invalid-seat-count"
  | "seat-count-below-floor";

export interface SoundSettings {
  readonly sounds: boolean;
  readonly cards: boolean;
  readonly actions: boolean;
  readonly notifications: boolean;
}

export const DEFAULT_SOUND_SETTINGS: SoundSettings = {
  sounds: true,
  cards: true,
  actions: true,
  notifications: true,
};

export const ChangeSoundSettingsRequestSchema = z.strictObject({
  sounds: z.boolean(),
  cards: z.boolean(),
  actions: z.boolean(),
  notifications: z.boolean(),
});

export type ChangeSoundSettingsRequest = z.infer<
  typeof ChangeSoundSettingsRequestSchema
>;

export type SoundSettingsChangeError =
  "room-not-found" | "invalid-request-body";

export const MIN_SHOT_CLOCK_SECONDS = 5;
export const MAX_SHOT_CLOCK_SECONDS = 600;

export interface ShotClockSettings {
  readonly enabled: boolean;
  readonly seconds: number;
}

export const DEFAULT_SHOT_CLOCK: ShotClockSettings = {
  enabled: false,
  seconds: 90,
};

export const ShotClockSettingsSchema = z.strictObject({
  enabled: z.boolean(),
  seconds: z.int().min(MIN_SHOT_CLOCK_SECONDS).max(MAX_SHOT_CLOCK_SECONDS),
});

export const ChangeShotClockRequestSchema = ShotClockSettingsSchema;

export type ChangeShotClockRequest = z.infer<
  typeof ChangeShotClockRequestSchema
>;

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

export type SittingOutReason = "voluntary" | "waiting-for-next-hand";

export interface SeatCountChange {
  readonly seatCount: number;
  readonly pendingSeatCount: number | null;
  readonly applied: boolean;
  readonly moves: readonly SeatMove[];
}

export interface SeatView {
  readonly id: SeatId;
  readonly claimed: boolean;
  readonly displayName?: string | null;
  readonly bot?: boolean;
  readonly sittingOut: boolean;
  readonly sittingOutReason: SittingOutReason | null;
  readonly disconnected: boolean;
}

export function isDealtInNextHand(seat: SeatView): boolean {
  return (
    seat.claimed && !seat.disconnected && seat.sittingOutReason !== "voluntary"
  );
}

export function countDealInSeats(seats: readonly SeatView[]): number {
  return seats.filter(isDealtInNextHand).length;
}

export interface RoomView {
  readonly code: string;
  readonly seats: readonly SeatView[];
  readonly pendingSeatCount: number | null;
  readonly pendingShotClock: ShotClockSettings | null;
  readonly soundSettings: SoundSettings;
  readonly shotClockSettings: ShotClockSettings;
}

export interface RoomViewMessage {
  readonly type: "room-view";
  readonly view: RoomView;
}

export interface PlayerEvictedMessage {
  readonly type: "player-evicted";
}

export interface SeatMovedMessage extends SeatMove {
  readonly type: "seat-moved";
}

export interface ViewSnapshotMessage {
  readonly type: "view-snapshot";
  readonly view: PlayerView | TableView;
}

export interface RoomEndedMessage {
  readonly type: "room-ended";
}

/**
 * The session's hands so far, oldest ordinal first — sent when a table
 * identity connects, and in answer to a `list-hands` request. Deliberately
 * its own message and not part of `RoomView`, which changes on a different
 * cadence (seats, presence) and should not grow on every seat change
 * (Phase 2 spec #129 §5). Replaces the recipient's list wholesale.
 */
export interface HandListMessage {
  readonly type: "hand-list";
  readonly summaries: readonly HandSummary[];
}

/**
 * One hand's summary, pushed the moment that hand completes. Appends to the
 * list a `hand-list` established, so a table that connected mid-session
 * never has to re-request the hands it already holds.
 */
export interface HandSummaryMessage {
  readonly type: "hand-summary";
  readonly summary: HandSummary;
}

export type ServerMessage =
  | RoomViewMessage
  | PlayerEvictedMessage
  | SeatMovedMessage
  | HandUpdateMessage
  | CommandRejectedMessage
  | ViewSnapshotMessage
  | RoomEndedMessage
  | HandListMessage
  | HandSummaryMessage;
