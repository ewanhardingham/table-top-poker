import type { PlayerView } from "@table-top-poker/protocol";
import type { StateCreator } from "zustand";

export interface HandSlice {
  readonly handView: PlayerView | null;
  readonly setHandView: (view: PlayerView) => void;
}

export const createHandSlice: StateCreator<HandSlice> = (set) => ({
  handView: null,
  setHandView: (view) => {
    set({ handView: view });
  },
});
