import type { HandSummary } from "@table-top-poker/protocol";
import type { StateCreator } from "zustand";

export interface HandHistorySlice {
  readonly handSummaries: readonly HandSummary[];
  readonly setHandList: (summaries: readonly HandSummary[]) => void;
  readonly addHandSummary: (summary: HandSummary) => void;
  readonly clearHandHistory: () => void;
}

export const createHandHistorySlice: StateCreator<HandHistorySlice> = (
  set,
) => ({
  handSummaries: [],
  setHandList: (summaries) => {
    set({ handSummaries: summaries });
  },
  addHandSummary: (summary) => {
    set((state) => ({ handSummaries: [...state.handSummaries, summary] }));
  },
  clearHandHistory: () => {
    set({ handSummaries: [] });
  },
});
