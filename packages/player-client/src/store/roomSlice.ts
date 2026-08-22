import {
  DEFAULT_SHOT_CLOCK,
  DEFAULT_SHOWDOWN_CLOCK,
  type RoomView,
  type SeatView,
  type ShotClockSettings,
  type ShowdownClockSettings,
} from "@table-top-poker/protocol";
import type { StateCreator } from "zustand";

export interface RoomSlice {
  readonly roomCode: string | null;
  readonly seats: readonly SeatView[];
  readonly shotClockSettings: ShotClockSettings;
  readonly showdownClockSettings: ShowdownClockSettings;
  readonly joinError: string | null;
  readonly setRoomView: (view: RoomView) => void;
  readonly setJoinError: (message: string | null) => void;
  readonly clearRoom: () => void;
}

export const createRoomSlice: StateCreator<RoomSlice> = (set) => ({
  roomCode: null,
  seats: [],
  shotClockSettings: DEFAULT_SHOT_CLOCK,
  showdownClockSettings: DEFAULT_SHOWDOWN_CLOCK,
  joinError: null,
  setRoomView: (view) => {
    set({
      roomCode: view.code,
      seats: view.seats,
      shotClockSettings: view.shotClockSettings,
      showdownClockSettings: view.showdownClockSettings,
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
      showdownClockSettings: DEFAULT_SHOWDOWN_CLOCK,
      joinError: null,
    });
  },
});
