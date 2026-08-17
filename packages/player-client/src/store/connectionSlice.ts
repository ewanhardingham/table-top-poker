import type { StateCreator } from "zustand";

export type ConnectionStatus = "disconnected" | "connecting" | "connected";

export interface ConnectionSlice {
  readonly connectionStatus: ConnectionStatus;
  readonly hasEverConnected: boolean;
  readonly setConnectionStatus: (status: ConnectionStatus) => void;
  readonly resetConnection: () => void;
}

export const createConnectionSlice: StateCreator<ConnectionSlice> = (set) => ({
  connectionStatus: "disconnected",
  hasEverConnected: false,
  setConnectionStatus: (connectionStatus) => {
    set(
      connectionStatus === "connected"
        ? { connectionStatus, hasEverConnected: true }
        : { connectionStatus },
    );
  },
  resetConnection: () => {
    set({ connectionStatus: "disconnected", hasEverConnected: false });
  },
});
