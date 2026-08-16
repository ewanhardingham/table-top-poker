import {
  DEFAULT_SHOT_CLOCK,
  type RoomView,
  type SeatView,
  type ShotClockSettings,
} from "@table-top-poker/protocol";
import type { StateCreator } from "zustand";

export interface RoomSlice {
  readonly roomCode: string | null;
  readonly seats: readonly SeatView[];
  readonly shotClockSettings: ShotClockSettings;
  readonly joinError: string | null;
  readonly setRoomView: (view: RoomView) => void;
  readonly setJoinError: (message: string | null) => void;
  readonly clearRoom: () => void;
}

export const createRoomSlice: StateCreator<RoomSlice> = (set) => ({
  roomCode: null,
  seats: [],
  shotClockSettings: DEFAULT_SHOT_CLOCK,
  joinError: null,
  setRoomView: (view) => {
    set({
      roomCode: view.code,
      seats: view.seats,
      shotClockSettings: view.shotClockSettings,
      joinError: null,
    });
  },
  setJoinError: (message) => {
    set({ joinError: message });
  },
  clearRoom: () => {
    set({
      roomCode: null,
      seats: [],
      shotClockSettings: DEFAULT_SHOT_CLOCK,
      joinError: null,
    });
  },
});
