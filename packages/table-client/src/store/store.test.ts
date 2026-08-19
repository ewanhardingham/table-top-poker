import {
  DEFAULT_SHOT_CLOCK,
  DEFAULT_SOUND_SETTINGS,
} from "@table-top-poker/protocol";
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
    expect(state.testMode).toBe(false);
  });

  it("updates the test-mode config independently of the room state", () => {
    useTableStore.getState().setTestMode(true);
    expect(useTableStore.getState().testMode).toBe(true);
    expect(useTableStore.getState().roomCode).toBeNull();
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
      pendingSeatCount: null,
      pendingShotClock: null,
      soundSettings: DEFAULT_SOUND_SETTINGS,
      shotClockSettings: DEFAULT_SHOT_CLOCK,
      seats: [
        {
          id: 0,
          claimed: true,
          sittingOut: false,
          sittingOutReason: null,
          disconnected: false,
        },
      ],
    });
    expect(useTableStore.getState().roomCode).toBe("ABCD");
    expect(useTableStore.getState().seats).toEqual([
      {
        id: 0,
        claimed: true,
        sittingOut: false,
        sittingOutReason: null,
        disconnected: false,
      },
    ]);
  });

  it("tracks a queued seat-count shrink from the room view", () => {
    useTableStore.getState().setRoomView({
      code: "ABCD",
      pendingSeatCount: 4,
      pendingShotClock: null,
      soundSettings: DEFAULT_SOUND_SETTINGS,
      shotClockSettings: DEFAULT_SHOT_CLOCK,
      seats: [
        {
          id: 0,
          claimed: true,
          sittingOut: false,
          sittingOutReason: null,
          disconnected: false,
        },
      ],
    });

    expect(useTableStore.getState().pendingSeatCount).toBe(4);
  });

  it("clears the hand view so a new room starts without stale hand state", () => {
    useTableStore.getState().setHandView({ phase: "no-hand", button: 0 });
    expect(useTableStore.getState().handView).not.toBeNull();

    useTableStore.getState().clearHand();
    expect(useTableStore.getState().handView).toBeNull();
  });

  it("latches recording-stopped true and keeps it through a room-view update", () => {
    useTableStore.getState().setRecordingStopped();
    expect(useTableStore.getState().recordingStopped).toBe(true);

    useTableStore.getState().setRoomView({
      code: "ABCD",
      pendingSeatCount: null,
      pendingShotClock: null,
      soundSettings: DEFAULT_SOUND_SETTINGS,
      shotClockSettings: DEFAULT_SHOT_CLOCK,
      seats: [],
    });
    expect(useTableStore.getState().recordingStopped).toBe(true);
  });

  it("clears the room slice back to its initial state", () => {
    useTableStore.getState().setRoomView({
      code: "ABCD",
      pendingSeatCount: null,
      pendingShotClock: null,
      soundSettings: DEFAULT_SOUND_SETTINGS,
      shotClockSettings: DEFAULT_SHOT_CLOCK,
      seats: [
        {
          id: 0,
          claimed: true,
          sittingOut: false,
          sittingOutReason: null,
          disconnected: false,
        },
      ],
    });
    useTableStore.getState().setRecordingStopped();
    useTableStore.getState().clearRoom();
    expect(useTableStore.getState().roomCode).toBeNull();
    expect(useTableStore.getState().seats).toEqual([]);
    expect(useTableStore.getState().recordingStopped).toBe(false);
  });
});
