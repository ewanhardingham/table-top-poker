import type { StateCreator } from "zustand";

export type ConnectionStatus = "disconnected" | "connecting" | "connected";

export interface ConnectionSlice {
  readonly connectionStatus: ConnectionStatus;
  readonly setConnectionStatus: (status: ConnectionStatus) => void;
}

export const createConnectionSlice: StateCreator<ConnectionSlice> = (set) => ({
  connectionStatus: "disconnected",
  setConnectionStatus: (connectionStatus) => {
    set({ connectionStatus });
  },
});
