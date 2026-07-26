import type { SeatId } from "@table-top-poker/protocol";
import type { StateCreator } from "zustand";
import { create } from "zustand";

export type ConnectionStatus = "disconnected" | "connecting" | "connected";

export interface ConnectionSlice {
  readonly connectionStatus: ConnectionStatus;
  readonly setConnectionStatus: (status: ConnectionStatus) => void;
}

export interface PlayerSlice {
  readonly seatId: SeatId | null;
  readonly setSeatId: (seatId: SeatId | null) => void;
  readonly placeholderCount: number;
  readonly incrementPlaceholder: () => void;
}

export type PlayerStore = ConnectionSlice & PlayerSlice;

export const createConnectionSlice: StateCreator<
  PlayerStore,
  [],
  [],
  ConnectionSlice
> = (set) => ({
  connectionStatus: "disconnected",
  setConnectionStatus: (connectionStatus) => {
    set({ connectionStatus });
  },
});

export const createPlayerSlice: StateCreator<
  PlayerStore,
  [],
  [],
  PlayerSlice
> = (set) => ({
  seatId: null,
  setSeatId: (seatId) => {
    set({ seatId });
  },
  placeholderCount: 0,
  incrementPlaceholder: () => {
    set((state) => ({ placeholderCount: state.placeholderCount + 1 }));
  },
});

export const usePlayerStore = create<PlayerStore>()((...a) => ({
  ...createConnectionSlice(...a),
  ...createPlayerSlice(...a),
}));
