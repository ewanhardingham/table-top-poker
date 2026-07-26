import type { RoomView, SeatView } from "@table-top-poker/protocol";
import type { StateCreator } from "zustand";

export interface RoomSlice {
  readonly roomCode: string | null;
  readonly joinUrl: string | null;
  readonly qrCodeDataUrl: string | null;
  readonly seats: readonly SeatView[];
  readonly setRoomCreated: (room: {
    code: string;
    joinUrl: string;
    qrCodeDataUrl: string;
  }) => void;
  readonly setRoomView: (view: RoomView) => void;
  readonly clearRoom: () => void;
}

export const createRoomSlice: StateCreator<RoomSlice> = (set) => ({
  roomCode: null,
  joinUrl: null,
  qrCodeDataUrl: null,
  seats: [],
  setRoomCreated: ({ code, joinUrl, qrCodeDataUrl }) => {
    set({ roomCode: code, joinUrl, qrCodeDataUrl });
  },
  setRoomView: (view) => {
    set({ roomCode: view.code, seats: view.seats });
  },
  clearRoom: () => {
    set({ roomCode: null, joinUrl: null, qrCodeDataUrl: null, seats: [] });
  },
});
