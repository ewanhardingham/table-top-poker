import {
  DEFAULT_SHOT_CLOCK,
  DEFAULT_SHOWDOWN_CLOCK,
  DEFAULT_SOUND_SETTINGS,
  type HandSummary,
  type TableReplayPosition,
} from "@table-top-poker/protocol";
import { beforeEach, describe, expect, it } from "vitest";
import { useTableStore } from "./store.js";

function summary(handOrdinal: number): HandSummary {
  return {
    handOrdinal,
    startedAt: "2026-08-13T19:04:00.000Z",
    button: 0,
    seatsDealtIn: [0, 1],
    survivors: [0],
    board: [],
    streetReached: "preflop",
    bettingShape: { kind: "walk" },
    outcome: { kind: "folded-out", winner: 0 },
  };
}

const positions: readonly TableReplayPosition[] = [
  { event: null, view: { phase: "no-hand", button: 0 } },
];

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
      showdownClockSettings: DEFAULT_SHOWDOWN_CLOCK,
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
      showdownClockSettings: DEFAULT_SHOWDOWN_CLOCK,
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
      showdownClockSettings: DEFAULT_SHOWDOWN_CLOCK,
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
      showdownClockSettings: DEFAULT_SHOWDOWN_CLOCK,
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

  it("replaces the hand list wholesale on a hand-list message", () => {
    useTableStore.getState().setHandList([summary(1), summary(2)]);
    expect(useTableStore.getState().handSummaries).toHaveLength(2);

    useTableStore.getState().setHandList([summary(1)]);
    expect(useTableStore.getState().handSummaries).toEqual([summary(1)]);
  });

  it("appends a hand summary without disturbing the existing list", () => {
    useTableStore.getState().setHandList([summary(1)]);
    useTableStore.getState().addHandSummary(summary(2));
    expect(useTableStore.getState().handSummaries).toEqual([
      summary(1),
      summary(2),
    ]);
  });

  it("clears the accumulated hand history", () => {
    useTableStore.getState().setHandList([summary(1)]);
    useTableStore.getState().clearHandHistory();
    expect(useTableStore.getState().handSummaries).toEqual([]);
  });

  it("holds a requested hand as loading until its positions arrive", () => {
    useTableStore.getState().openReview(2);
    expect(useTableStore.getState().review).toEqual({
      status: "loading",
      handOrdinal: 2,
    });

    useTableStore.getState().receiveReplay(2, positions);
    expect(useTableStore.getState().review).toEqual({
      status: "ready",
      handOrdinal: 2,
      positions,
    });
  });

  it("drops a replay for a hand no longer under review", () => {
    useTableStore.getState().openReview(2);
    useTableStore.getState().receiveReplay(1, positions);
    expect(useTableStore.getState().review?.status).toBe("loading");

    useTableStore.getState().closeReview();
    useTableStore.getState().receiveReplay(2, positions);
    expect(useTableStore.getState().review).toBeNull();
  });

  it("marks a hand the server refused unavailable, and only while loading", () => {
    useTableStore.getState().openReview(2);
    useTableStore.getState().failReview();
    expect(useTableStore.getState().review).toEqual({
      status: "unavailable",
      handOrdinal: 2,
    });

    useTableStore.getState().receiveReplay(2, positions);
    useTableStore.getState().failReview();
    expect(useTableStore.getState().review?.status).toBe("ready");
  });
});
