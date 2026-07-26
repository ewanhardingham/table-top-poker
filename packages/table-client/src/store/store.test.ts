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
    useTableStore.getState().setRoomCreated({
      code: "ABCD",
      joinUrl: "http://localhost:3000/join/ABCD",
      qrCodeDataUrl: "data:image/png;base64,xyz",
    });
    expect(useTableStore.getState().roomCode).toBe("ABCD");
    expect(useTableStore.getState().connectionStatus).toBe("connected");
  });

  it("replaces the seat list from a room-view snapshot", () => {
    useTableStore.getState().setRoomView({
      code: "ABCD",
      seats: [{ id: 0, claimed: true, sittingOut: false }],
    });
    expect(useTableStore.getState().roomCode).toBe("ABCD");
    expect(useTableStore.getState().seats).toEqual([
      { id: 0, claimed: true, sittingOut: false },
    ]);
  });

  it("clears the room slice back to its initial state", () => {
    useTableStore.getState().setRoomView({
      code: "ABCD",
      seats: [{ id: 0, claimed: true, sittingOut: false }],
    });
    useTableStore.getState().clearRoom();
    expect(useTableStore.getState().roomCode).toBeNull();
    expect(useTableStore.getState().seats).toEqual([]);
  });
});
