import type { StateCreator } from "zustand";

export type ConnectionStatus = "disconnected" | "connecting" | "connected";

export interface ConnectionSlice {
  readonly connectionStatus: ConnectionStatus;
  /**
   * Latched on the first `connected`. The status starts at `disconnected`
   * before a socket has ever been opened, which is indistinguishable from a
   * dropped one by status alone — this bit is what tells them apart, so the
   * player is never warned about a connection they have not yet made
   * (ADR-0006).
   */
  readonly hasEverConnected: boolean;
  readonly setConnectionStatus: (status: ConnectionStatus) => void;
  /** Back to the pre-socket state — the latch clears with the connection. */
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
