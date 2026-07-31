import type { SeatId } from "@table-top-poker/protocol";
import type { StateCreator } from "zustand";

export interface SeatSlice {
  readonly seatId: SeatId | null;
  readonly sittingOut: boolean;
  readonly setSeat: (seat: { seatId: SeatId; sittingOut: boolean }) => void;
  readonly moveSeat: (seatId: SeatId) => void;
  readonly clearSeat: () => void;
}

export const createSeatSlice: StateCreator<SeatSlice> = (set) => ({
  seatId: null,
  sittingOut: false,
  setSeat: ({ seatId, sittingOut }) => {
    set({ seatId, sittingOut });
  },
  moveSeat: (seatId) => {
    set({ seatId });
  },
  clearSeat: () => {
    set({ seatId: null, sittingOut: false });
  },
});
