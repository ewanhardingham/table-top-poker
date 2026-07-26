import { beforeEach, describe, expect, it } from "vitest";
import { usePlayerStore } from "./store.js";

describe("usePlayerStore", () => {
  beforeEach(() => {
    usePlayerStore.setState(usePlayerStore.getInitialState());
  });

  it("starts disconnected with no seat claimed", () => {
    const state = usePlayerStore.getState();
    expect(state.connectionStatus).toBe("disconnected");
    expect(state.seatId).toBeNull();
  });

  it("updates the connection slice independently of the seat slice", () => {
    usePlayerStore.getState().setConnectionStatus("connected");
    expect(usePlayerStore.getState().connectionStatus).toBe("connected");
    expect(usePlayerStore.getState().seatId).toBeNull();
  });

  it("updates the seat slice independently of the connection slice", () => {
    usePlayerStore.getState().setConnectionStatus("connected");
    usePlayerStore.getState().setSeatId(3);
    expect(usePlayerStore.getState().seatId).toBe(3);
    expect(usePlayerStore.getState().connectionStatus).toBe("connected");
  });
});
