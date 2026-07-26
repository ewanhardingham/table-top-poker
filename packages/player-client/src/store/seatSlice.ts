import type { SeatId } from "@table-top-poker/protocol";
import type { StateCreator } from "zustand";

export interface SeatSlice {
  readonly seatId: SeatId | null;
  readonly setSeatId: (seatId: SeatId | null) => void;
}

/** Placeholder slice — replaced by the real seat-claim flow once ticket 13 lands. */
export const createSeatSlice: StateCreator<SeatSlice> = (set) => ({
  seatId: null,
  setSeatId: (seatId) => {
    set({ seatId });
  },
});
