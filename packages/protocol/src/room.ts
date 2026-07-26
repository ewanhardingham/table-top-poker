import type { SeatId } from "@table-top-poker/engine";

/** A seat's public state — never carries its claim token. */
export interface SeatView {
  readonly id: SeatId;
  readonly claimed: boolean;
  readonly sittingOut: boolean;
}

export interface RoomView {
  readonly code: string;
  readonly seats: readonly SeatView[];
}

/** Pushed over the room's WebSocket whenever seat state changes. */
export interface ServerMessage {
  readonly type: "room-view";
  readonly view: RoomView;
}
