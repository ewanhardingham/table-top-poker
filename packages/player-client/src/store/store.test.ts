import { beforeEach, describe, expect, it } from "vitest";
import { usePlayerStore } from "./store.js";

describe("usePlayerStore", () => {
  beforeEach(() => {
    usePlayerStore.setState(usePlayerStore.getInitialState());
  });

  it("starts disconnected with no room joined and no seat claimed", () => {
    const state = usePlayerStore.getState();
    expect(state.connectionStatus).toBe("disconnected");
    expect(state.roomCode).toBeNull();
    expect(state.seatId).toBeNull();
  });

  it("updates the connection slice independently of the seat slice", () => {
    usePlayerStore.getState().setConnectionStatus("connected");
    usePlayerStore.getState().setSeat({ seatId: 3, sittingOut: false });
    expect(usePlayerStore.getState().connectionStatus).toBe("connected");
    expect(usePlayerStore.getState().seatId).toBe(3);
  });

  it("updates the seat slice independently of the connection slice", () => {
    usePlayerStore.getState().setConnectionStatus("connected");
    usePlayerStore.getState().setSeat({ seatId: 3, sittingOut: true });
    expect(usePlayerStore.getState().seatId).toBe(3);
    expect(usePlayerStore.getState().sittingOut).toBe(true);
    expect(usePlayerStore.getState().connectionStatus).toBe("connected");
  });

  it("clears the seat slice independently of the room slice", () => {
    usePlayerStore.getState().setRoomView({
      code: "ABCD",
      seats: [{ id: 0, claimed: true, sittingOut: false, disconnected: false }],
    });
    usePlayerStore.getState().setSeat({ seatId: 0, sittingOut: false });

    usePlayerStore.getState().clearSeat();

    expect(usePlayerStore.getState().seatId).toBeNull();
    expect(usePlayerStore.getState().roomCode).toBe("ABCD");
  });

  it("replaces the seat list from a room-view snapshot", () => {
    usePlayerStore.getState().setRoomView({
      code: "ABCD",
      seats: [{ id: 0, claimed: true, sittingOut: false, disconnected: false }],
    });
    expect(usePlayerStore.getState().roomCode).toBe("ABCD");
    expect(usePlayerStore.getState().seats).toEqual([
      { id: 0, claimed: true, sittingOut: false, disconnected: false },
    ]);
  });

  it("tracks a join error independently of the room slice", () => {
    usePlayerStore.getState().setJoinError("room-not-found");
    expect(usePlayerStore.getState().joinError).toBe("room-not-found");
    expect(usePlayerStore.getState().roomCode).toBeNull();
  });

  it("clears the room slice back to its initial state", () => {
    usePlayerStore.getState().setRoomView({
      code: "ABCD",
      seats: [{ id: 0, claimed: true, sittingOut: false, disconnected: false }],
    });
    usePlayerStore.getState().clearRoom();
    expect(usePlayerStore.getState().roomCode).toBeNull();
    expect(usePlayerStore.getState().seats).toEqual([]);
  });

  it("marks an action pending on send, with no rejection yet", () => {
    usePlayerStore.getState().sendStarted("call");
    expect(usePlayerStore.getState().pendingAction).toBe("call");
    expect(usePlayerStore.getState().rejection).toBeNull();
  });

  it("clears pending and attributes the reason to it on reject", () => {
    usePlayerStore.getState().sendStarted("raise");
    usePlayerStore.getState().commandRejected("not-your-turn");
    expect(usePlayerStore.getState().pendingAction).toBeNull();
    expect(usePlayerStore.getState().rejection).toEqual({
      action: "raise",
      reason: "not-your-turn",
    });
  });

  it("attributes a reject with nothing pending to no action", () => {
    usePlayerStore.getState().commandRejected("invalid-command");
    expect(usePlayerStore.getState().rejection).toEqual({
      action: null,
      reason: "invalid-command",
    });
  });

  it("clears pending and any rejection on the next view snapshot", () => {
    usePlayerStore.getState().sendStarted("fold");
    usePlayerStore.getState().commandRejected("action-not-legal");
    usePlayerStore.getState().viewSnapshotReceived();
    expect(usePlayerStore.getState().pendingAction).toBeNull();
    expect(usePlayerStore.getState().rejection).toBeNull();
  });

  it("dismisses a stale rejection as soon as another action is sent", () => {
    usePlayerStore.getState().sendStarted("check");
    usePlayerStore.getState().commandRejected("action-not-legal");
    usePlayerStore.getState().sendStarted("fold");
    expect(usePlayerStore.getState().rejection).toBeNull();
    expect(usePlayerStore.getState().pendingAction).toBe("fold");
  });
});
