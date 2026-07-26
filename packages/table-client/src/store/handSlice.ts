import type { HandEvent, TableView } from "@table-top-poker/protocol";
import type { StateCreator } from "zustand";

export interface HandSlice {
  readonly handView: TableView | null;
  readonly lastEvent: HandEvent | null;
  readonly setHandUpdate: (event: HandEvent, view: TableView) => void;
}

export const createHandSlice: StateCreator<HandSlice> = (set) => ({
  handView: null,
  lastEvent: null,
  setHandUpdate: (event, view) => {
    set({ handView: view, lastEvent: event });
  },
});
