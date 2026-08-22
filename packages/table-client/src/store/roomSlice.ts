import {
  DEFAULT_SHOT_CLOCK,
  DEFAULT_SHOWDOWN_CLOCK,
  DEFAULT_SOUND_SETTINGS,
  type RoomView,
  type SeatView,
  type ShotClockSettings,
  type ShowdownClockSettings,
  type SoundSettings,
} from "@table-top-poker/protocol";
import type { StateCreator } from "zustand";

export interface RoomSlice {
  readonly roomCode: string | null;
  readonly joinUrl: string | null;
  readonly qrCodeDataUrl: string | null;
  readonly seats: readonly SeatView[];
  readonly pendingSeatCount: number | null;
  readonly pendingShotClock: ShotClockSettings | null;
  readonly soundSettings: SoundSettings;
  readonly shotClockSettings: ShotClockSettings;
  readonly showdownClockSettings: ShowdownClockSettings;
  /**
   * Latched true once "Continue without recording" resumes the Room —
   * never cleared while the Room lives, since recording never comes back
   * (Phase 2 spec #129 §3).
   */
  readonly recordingStopped: boolean;
  readonly setRoomCreated: (room: {
    code: string;
    joinUrl: string;
    qrCodeDataUrl: string;
  }) => void;
  readonly setRoomView: (view: RoomView) => void;
  readonly setRecordingStopped: () => void;
  readonly clearRoom: () => void;
}

export const createRoomSlice: StateCreator<RoomSlice> = (set) => ({
  roomCode: null,
  joinUrl: null,
  qrCodeDataUrl: null,
  seats: [],
  pendingSeatCount: null,
  pendingShotClock: null,
  soundSettings: DEFAULT_SOUND_SETTINGS,
  shotClockSettings: DEFAULT_SHOT_CLOCK,
  showdownClockSettings: DEFAULT_SHOWDOWN_CLOCK,
  recordingStopped: false,
  setRoomCreated: ({ code, joinUrl, qrCodeDataUrl }) => {
    set({
      roomCode: code,
      joinUrl,
      qrCodeDataUrl,
      pendingSeatCount: null,
      pendingShotClock: null,
    });
  },
  setRoomView: (view) => {
    set({
      roomCode: view.code,
      seats: view.seats,
      pendingSeatCount: view.pendingSeatCount,
      pendingShotClock: view.pendingShotClock,
      soundSettings: view.soundSettings,
      shotClockSettings: view.shotClockSettings,
      showdownClockSettings: view.showdownClockSettings,
    });
  },
  setRecordingStopped: () => {
    set({ recordingStopped: true });
  },
  clearRoom: () => {
    set({
      roomCode: null,
      joinUrl: null,
      qrCodeDataUrl: null,
      seats: [],
      pendingSeatCount: null,
      pendingShotClock: null,
      soundSettings: DEFAULT_SOUND_SETTINGS,
      shotClockSettings: DEFAULT_SHOT_CLOCK,
      showdownClockSettings: DEFAULT_SHOWDOWN_CLOCK,
      recordingStopped: false,
    });
  },
});
