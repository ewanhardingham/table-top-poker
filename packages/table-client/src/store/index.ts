import type { StateCreator } from "zustand";
import { create } from "zustand";

export type ConnectionStatus = "disconnected" | "connecting" | "connected";

export interface ConnectionSlice {
  readonly connectionStatus: ConnectionStatus;
  readonly setConnectionStatus: (status: ConnectionStatus) => void;
}

export interface TableSlice {
  readonly roomCode: string | null;
  readonly setRoomCode: (code: string | null) => void;
  readonly placeholderCount: number;
  readonly incrementPlaceholder: () => void;
}

export type TableStore = ConnectionSlice & TableSlice;

export const createConnectionSlice: StateCreator<
  TableStore,
  [],
  [],
  ConnectionSlice
> = (set) => ({
  connectionStatus: "disconnected",
  setConnectionStatus: (connectionStatus) => {
    set({ connectionStatus });
  },
});

export const createTableSlice: StateCreator<TableStore, [], [], TableSlice> = (
  set,
) => ({
  roomCode: null,
  setRoomCode: (roomCode) => {
    set({ roomCode });
  },
  placeholderCount: 0,
  incrementPlaceholder: () => {
    set((state) => ({ placeholderCount: state.placeholderCount + 1 }));
  },
});

export const useTableStore = create<TableStore>()((...a) => ({
  ...createConnectionSlice(...a),
  ...createTableSlice(...a),
}));
