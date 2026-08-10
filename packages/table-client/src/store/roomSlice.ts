import {
  DEFAULT_SOUND_SETTINGS,
  type RoomView,
  type SeatView,
  type SoundSettings,
} from "@table-top-poker/protocol";
import type { StateCreator } from "zustand";

export interface RoomSlice {
  readonly roomCode: string | null;
  readonly joinUrl: string | null;
  readonly qrCodeDataUrl: string | null;
  readonly seats: readonly SeatView[];
  readonly pendingSeatCount: number | null;
  readonly soundSettings: SoundSettings;
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
  pendingSeatCount: null,
  soundSettings: DEFAULT_SOUND_SETTINGS,
  setRoomCreated: ({ code, joinUrl, qrCodeDataUrl }) => {
    set({ roomCode: code, joinUrl, qrCodeDataUrl, pendingSeatCount: null });
  },
  setRoomView: (view) => {
    set({
      roomCode: view.code,
      seats: view.seats,
      pendingSeatCount: view.pendingSeatCount,
      soundSettings: view.soundSettings,
    });
  },
  clearRoom: () => {
    set({
      roomCode: null,
      joinUrl: null,
      qrCodeDataUrl: null,
      seats: [],
      pendingSeatCount: null,
      soundSettings: DEFAULT_SOUND_SETTINGS,
    });
  },
});
