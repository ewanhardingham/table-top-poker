import type { HandSummary } from "@table-top-poker/protocol";
import type { StateCreator } from "zustand";

export interface HandHistorySlice {
  readonly handSummaries: readonly HandSummary[];
  readonly setHandList: (summaries: readonly HandSummary[]) => void;
  /** Replaces the row of the same ordinal: a Hand is re-summarised as it is shown. */
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
    set((state) => ({
      handSummaries: [
        ...state.handSummaries.filter(
          (listed) => listed.handOrdinal !== summary.handOrdinal,
        ),
        summary,
      ],
    }));
  },
  clearHandHistory: () => {
    set({ handSummaries: [] });
  },
});
