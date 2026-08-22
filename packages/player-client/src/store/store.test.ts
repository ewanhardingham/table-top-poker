import {
  DEFAULT_SHOT_CLOCK,
  DEFAULT_SOUND_SETTINGS,
} from "@table-top-poker/protocol";
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

  it("latches has-ever-connected on the first successful connect", () => {
    expect(usePlayerStore.getState().hasEverConnected).toBe(false);

    usePlayerStore.getState().setConnectionStatus("connecting");
    expect(usePlayerStore.getState().hasEverConnected).toBe(false);

    usePlayerStore.getState().setConnectionStatus("connected");
    expect(usePlayerStore.getState().hasEverConnected).toBe(true);

    usePlayerStore.getState().setConnectionStatus("disconnected");
    expect(usePlayerStore.getState().hasEverConnected).toBe(true);
  });

  it("clears the latch when the connection is reset", () => {
    usePlayerStore.getState().setConnectionStatus("connected");
    usePlayerStore.getState().resetConnection();

    const state = usePlayerStore.getState();
    expect(state.connectionStatus).toBe("disconnected");
    expect(state.hasEverConnected).toBe(false);
  });

  it("updates the connection slice independently of the seat slice", () => {
    usePlayerStore.getState().setConnectionStatus("connected");
    usePlayerStore.getState().setSeat({ seatId: 3, sittingOut: false });
    expect(usePlayerStore.getState().connectionStatus).toBe("connected");
    expect(usePlayerStore.getState().seatId).toBe(3);
  });

  it("updates the seat slice independently of the connection slice", () => {
    usePlayerStore.getState().setConnectionStatus("connected");
    usePlayerStore.getState().setSeat({
      seatId: 3,
      sittingOut: true,
      sittingOutReason: "voluntary",
    });
    expect(usePlayerStore.getState().seatId).toBe(3);
    expect(usePlayerStore.getState().sittingOut).toBe(true);
    expect(usePlayerStore.getState().sittingOutReason).toBe("voluntary");
    expect(usePlayerStore.getState().connectionStatus).toBe("connected");
  });

  it("moves a seat without resetting its sitting-out state", () => {
    usePlayerStore.getState().setSeat({ seatId: 5, sittingOut: true });

    usePlayerStore.getState().moveSeat(1);

    expect(usePlayerStore.getState().seatId).toBe(1);
    expect(usePlayerStore.getState().sittingOut).toBe(true);
  });

  it("clears the seat slice independently of the room slice", () => {
    usePlayerStore.getState().setRoomView({
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
    usePlayerStore.getState().setSeat({ seatId: 0, sittingOut: false });

    usePlayerStore.getState().clearSeat();

    expect(usePlayerStore.getState().seatId).toBeNull();
    expect(usePlayerStore.getState().roomCode).toBe("ABCD");
  });

  it("replaces the seat list from a room-view snapshot", () => {
    usePlayerStore.getState().setRoomView({
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
    expect(usePlayerStore.getState().roomCode).toBe("ABCD");
    expect(usePlayerStore.getState().seats).toEqual([
      {
        id: 0,
        claimed: true,
        sittingOut: false,
        sittingOutReason: null,
        disconnected: false,
      },
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
    usePlayerStore.getState().clearRoom();
    expect(usePlayerStore.getState().roomCode).toBeNull();
    expect(usePlayerStore.getState().seats).toEqual([]);
  });

  it("clears the hand view so a new room starts without stale hole cards", () => {
    usePlayerStore.getState().setHandView({ phase: "no-hand", button: 0 });
    expect(usePlayerStore.getState().handView).not.toBeNull();

    usePlayerStore.getState().clearHand();
    expect(usePlayerStore.getState().handView).toBeNull();
  });

  it("does not clear a stale hand result when only the room is torn down (#172)", () => {
    usePlayerStore.getState().setRoomView({
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
    usePlayerStore.getState().setSeat({ seatId: 0, sittingOut: false });
    usePlayerStore.getState().setHandView({
      phase: "folded-out",
      button: 0,
      smallBlind: 0,
      bigBlind: 0,
      dealtSeatCount: 1,
      winner: 0,
    });

    usePlayerStore.getState().clearRoom();

    expect(usePlayerStore.getState().roomCode).toBeNull();
    expect(usePlayerStore.getState().handView).not.toBeNull();
  });

  it("leaves a clean slate for the next room when the hand is cleared too (#172)", () => {
    usePlayerStore.getState().setRoomView({
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
    usePlayerStore.getState().setSeat({ seatId: 0, sittingOut: false });
    usePlayerStore.getState().setHandView({
      phase: "folded-out",
      button: 0,
      smallBlind: 0,
      bigBlind: 0,
      dealtSeatCount: 1,
      winner: 0,
    });

    usePlayerStore.getState().clearSeat();
    usePlayerStore.getState().clearHand();
    usePlayerStore.getState().clearRoom();

    expect(usePlayerStore.getState().roomCode).toBeNull();
    expect(usePlayerStore.getState().seatId).toBeNull();
    expect(usePlayerStore.getState().handView).toBeNull();
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
