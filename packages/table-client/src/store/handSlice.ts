import type { RejectionReason, TableView } from "@table-top-poker/protocol";
import type { StateCreator } from "zustand";

export interface HandSlice {
  readonly handView: TableView | null;
  /** The last refusal the table itself provoked; cleared by the next update. */
  readonly commandRejection: RejectionReason | null;
  readonly setHandView: (view: TableView) => void;
  readonly setCommandRejection: (reason: RejectionReason) => void;
  readonly clearHand: () => void;
}

export const createHandSlice: StateCreator<HandSlice> = (set) => ({
  handView: null,
  commandRejection: null,
  setHandView: (view) => {
    set({ handView: view, commandRejection: null });
  },
  setCommandRejection: (reason) => {
    set({ commandRejection: reason });
  },
  clearHand: () => {
    set({ handView: null, commandRejection: null });
  },
});
