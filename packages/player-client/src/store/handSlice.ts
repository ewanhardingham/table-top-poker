import type { HandEvent, PlayerView } from "@table-top-poker/protocol";
import type { StateCreator } from "zustand";

export interface HandSlice {
  readonly handView: PlayerView | null;
  readonly lastEvent: HandEvent | null;
  readonly setHandUpdate: (event: HandEvent, view: PlayerView) => void;
}

export const createHandSlice: StateCreator<HandSlice> = (set) => ({
  handView: null,
  lastEvent: null,
  setHandUpdate: (event, view) => {
    set({ handView: view, lastEvent: event });
  },
});
