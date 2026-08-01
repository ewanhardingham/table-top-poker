import type { SeatId } from "@table-top-poker/protocol";
import type { StateCreator } from "zustand";

export interface SeatSlice {
  readonly seatId: SeatId | null;
  readonly displayName: string | null;
  readonly sittingOut: boolean;
  readonly setSeat: (seat: {
    seatId: SeatId;
    sittingOut: boolean;
    displayName?: string | null;
  }) => void;
  readonly moveSeat: (seatId: SeatId) => void;
  readonly clearSeat: () => void;
}

export const createSeatSlice: StateCreator<SeatSlice> = (set) => ({
  seatId: null,
  displayName: null,
  sittingOut: false,
  setSeat: ({ seatId, sittingOut, displayName = null }) => {
    set({ seatId, sittingOut, displayName });
  },
  moveSeat: (seatId) => {
    set({ seatId });
  },
  clearSeat: () => {
    set({ seatId: null, displayName: null, sittingOut: false });
  },
});
