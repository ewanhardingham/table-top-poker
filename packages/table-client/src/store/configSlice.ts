import type { StateCreator } from "zustand";

export interface ConfigSlice {
  readonly testMode: boolean;
  readonly setTestMode: (testMode: boolean) => void;
}

export const createConfigSlice: StateCreator<ConfigSlice> = (set) => ({
  testMode: false,
  setTestMode: (testMode) => {
    set({ testMode });
  },
});
