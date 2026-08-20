import type { TableReplayPosition } from "@table-top-poker/protocol";
import type { StateCreator } from "zustand";

/**
 * The hand under review. `loading` is its own state rather than a null
 * `positions`, so a reply that arrives after the table has backed out — or
 * moved on to another hand — can be recognised as stale and dropped.
 */
export type HandReviewState =
  | { readonly status: "loading"; readonly handOrdinal: number }
  | {
      readonly status: "ready";
      readonly handOrdinal: number;
      readonly positions: readonly TableReplayPosition[];
    }
  | { readonly status: "unavailable"; readonly handOrdinal: number };

export interface ReplaySlice {
  readonly review: HandReviewState | null;
  readonly openReview: (handOrdinal: number) => void;
  readonly receiveReplay: (
    handOrdinal: number,
    positions: readonly TableReplayPosition[],
  ) => void;
  readonly failReview: () => void;
  readonly closeReview: () => void;
}

export const createReplaySlice: StateCreator<ReplaySlice> = (set) => ({
  review: null,
  openReview: (handOrdinal) => {
    set({ review: { status: "loading", handOrdinal } });
  },
  receiveReplay: (handOrdinal, positions) => {
    set((state) =>
      state.review?.handOrdinal === handOrdinal
        ? { review: { status: "ready", handOrdinal, positions } }
        : state,
    );
  },
  failReview: () => {
    set((state) =>
      state.review?.status === "loading"
        ? {
            review: {
              status: "unavailable",
              handOrdinal: state.review.handOrdinal,
            },
          }
        : state,
    );
  },
  closeReview: () => {
    set({ review: null });
  },
});
