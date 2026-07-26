import { beforeEach, describe, expect, it } from "vitest";
import { useTableStore } from "./store.js";

describe("useTableStore", () => {
  beforeEach(() => {
    useTableStore.setState(useTableStore.getInitialState());
  });

  it("starts disconnected with no room code", () => {
    const state = useTableStore.getState();
    expect(state.connectionStatus).toBe("disconnected");
    expect(state.roomCode).toBeNull();
  });

  it("updates the connection slice independently of the room slice", () => {
    useTableStore.getState().setConnectionStatus("connected");
    expect(useTableStore.getState().connectionStatus).toBe("connected");
    expect(useTableStore.getState().roomCode).toBeNull();
  });

  it("updates the room slice independently of the connection slice", () => {
    useTableStore.getState().setConnectionStatus("connected");
    useTableStore.getState().setRoomCode("ABCD");
    expect(useTableStore.getState().roomCode).toBe("ABCD");
    expect(useTableStore.getState().connectionStatus).toBe("connected");
  });
});
