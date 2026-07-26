import type { TableView } from "@table-top-poker/protocol";
import type { StateCreator } from "zustand";

export interface HandSlice {
  readonly handView: TableView | null;
  readonly setHandView: (view: TableView) => void;
}

export const createHandSlice: StateCreator<HandSlice> = (set) => ({
  handView: null,
  setHandView: (view) => {
    set({ handView: view });
  },
});
