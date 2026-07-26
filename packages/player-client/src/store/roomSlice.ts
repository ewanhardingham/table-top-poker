import type { RoomView, SeatView } from "@table-top-poker/protocol";
import type { StateCreator } from "zustand";

export interface RoomSlice {
  readonly roomCode: string | null;
  readonly seats: readonly SeatView[];
  readonly joinError: string | null;
  readonly setRoomView: (view: RoomView) => void;
  readonly setJoinError: (message: string | null) => void;
  readonly clearRoom: () => void;
}

export const createRoomSlice: StateCreator<RoomSlice> = (set) => ({
  roomCode: null,
  seats: [],
  joinError: null,
  setRoomView: (view) => {
    set({ roomCode: view.code, seats: view.seats, joinError: null });
  },
  setJoinError: (message) => {
    set({ joinError: message });
  },
  clearRoom: () => {
    set({ roomCode: null, seats: [], joinError: null });
  },
});
