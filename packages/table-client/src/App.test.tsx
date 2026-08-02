import { DEFAULT_SEAT_COUNT } from "@table-top-poker/protocol";
import type { SeatView, TableView } from "@table-top-poker/protocol";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { App } from "./App.js";
import type { TableStore } from "./store/store.js";

/**
 * These tests render on the server, and zustand serves `getInitialState` to
 * `useSyncExternalStore` there — a plain `setState` would never reach the
 * markup. So the hook reads a per-test override instead; the real slices still
 * supply every value the test does not name, including the setters
 * `useWebSocket` reads.
 */
const store = vi.hoisted((): { overrides: Partial<TableStore> } => ({
  overrides: {},
}));

vi.mock("./store/store.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./store/store.js")>();
  const initial = actual.useTableStore.getInitialState();
  const useTableStore = (selector: (state: TableStore) => unknown) =>
    selector({ ...initial, ...store.overrides });
  return {
    ...actual,
    useTableStore: Object.assign(useTableStore, actual.useTableStore),
  };
});

function seat(id: number, claimed: boolean): SeatView {
  return {
    id,
    claimed,
    sittingOut: false,
    sittingOutReason: null,
    disconnected: false,
  };
}

const liveHand: TableView = {
  phase: "betting",
  button: 0,
  street: "flop",
  board: [],
  toAct: [1],
  seats: [
    { seatId: 0, folded: false },
    { seatId: 1, folded: false },
  ],
};

/** Puts the table in a room, with the seats claimed and hand state given. */
function enterRoom(claimedSeats: number, handView: TableView | null) {
  store.overrides = {
    roomCode: "ABCD",
    joinUrl: "http://localhost:3000/join/ABCD",
    qrCodeDataUrl: "data:image/png;base64,xyz",
    seats: [0, 1].map((id) => seat(id, id < claimedSeats)),
    connectionStatus: "connected",
    handView,
  };
}

describe("App", () => {
  afterEach(() => {
    store.overrides = {};
  });

  it("renders the table-client shell", () => {
    const html = renderToStaticMarkup(<App />);
    expect(html).toContain('data-testid="table-client-shell"');
  });

  it("shows a Create room button and hides the connection badge before a room exists", () => {
    const html = renderToStaticMarkup(<App />);
    expect(html).toContain('data-testid="create-room-button"');
    expect(html).not.toContain('data-testid="room-panel"');
    expect(html).not.toContain('data-testid="connection-status"');
  });

  it("picks the table size before the room code or QR is shown", () => {
    const html = renderToStaticMarkup(<App />);
    expect(html).toContain('data-testid="seat-count-picker"');
    expect(html).not.toContain('data-testid="join-panel"');
  });

  it("defaults the picker to a full eight-seat table", () => {
    const html = renderToStaticMarkup(<App />);
    expect(html).toContain(
      `data-testid="seat-count-${String(DEFAULT_SEAT_COUNT)}-button" aria-pressed="true"`,
    );
  });

  it("puts the lobby controls inside the join panel, with no rail and no room-code pill", () => {
    enterRoom(2, null);
    const html = renderToStaticMarkup(<App />);

    expect(html).toContain('data-testid="join-panel"');
    expect(html).toContain('data-placement="join-panel"');
    expect(html).not.toContain('data-placement="rail"');
    // The join card is the room-join surface in the lobby; a second copy of
    // the code in the status bar would be redundant.
    expect(html).not.toContain('data-testid="join-code-toggle"');
    expect(html).toContain('data-testid="connection-status"');
  });

  it("keeps Deal hand in the lobby but disabled below two seated players", () => {
    enterRoom(1, null);
    const html = renderToStaticMarkup(<App />);

    expect(html).toMatch(/data-testid="start-hand-button"[^>]*disabled/);
    expect(html).toContain('data-testid="end-session-button"');
  });

  it("moves the controls to the rail and shows the room code once a hand starts", () => {
    enterRoom(2, liveHand);
    const html = renderToStaticMarkup(<App />);

    expect(html).toContain('data-placement="rail"');
    expect(html).not.toContain('data-placement="join-panel"');
    expect(html).not.toContain('data-testid="join-panel"');
    expect(html).toContain('data-testid="join-code-toggle"');
    expect(html).toContain('data-testid="connection-status"');
  });
});
