import type { SeatView, TableView } from "@table-top-poker/protocol";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { App } from "./App.js";
import type { TableStore } from "./store/store.js";

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
  tabled: [],
  turnEndsAt: null,
  button: 0,
  smallBlind: 1,
  bigBlind: 2,
  dealtSeatCount: 3,
  burnedCount: 0,
  street: "flop",
  board: [],
  toAct: [1],
  seats: [
    { seatId: 0, folded: false, allIn: false },
    { seatId: 1, folded: false, allIn: false },
  ],
};

const completeHand: TableView = {
  phase: "folded-out",
  button: 0,
  smallBlind: 1,
  bigBlind: 2,
  dealtSeatCount: 2,
  burnedCount: 0,
  board: [],
  winner: 0,
};

const showdownHand: TableView = {
  phase: "showdown",
  turnEndsAt: null,
  queue: [],
  mucked: [],
  button: 0,
  smallBlind: 1,
  bigBlind: 2,
  dealtSeatCount: 2,
  burnedCount: 0,
  board: [
    { rank: "A", suit: "spades" },
    { rank: "K", suit: "hearts" },
    { rank: "2", suit: "clubs" },
    { rank: "7", suit: "diamonds" },
    { rank: "9", suit: "clubs" },
  ],
  contestants: [0, 1],
  winners: [0],
  results: [
    {
      seatId: 0,
      rank: 1,
      description: "Pair of Aces",
      holeCards: [
        { rank: "A", suit: "clubs" },
        { rank: "3", suit: "hearts" },
      ],
      bestHand: [
        { rank: "A", suit: "spades" },
        { rank: "A", suit: "clubs" },
        { rank: "K", suit: "hearts" },
        { rank: "9", suit: "clubs" },
        { rank: "7", suit: "diamonds" },
      ],
    },
  ],
};

function enterRoom(
  claimedSeats: number,
  handView: TableView | null,
  testMode = false,
) {
  store.overrides = {
    roomCode: "ABCD",
    joinUrl: "http://localhost:3000/join/ABCD",
    qrCodeDataUrl: "data:image/png;base64,xyz",
    seats: [0, 1].map((id) => seat(id, id < claimedSeats)),
    connectionStatus: "connected",
    handView,
    testMode,
  };
}

const openWindow: TableView = {
  ...showdownHand,
  winners: null,
  results: [],
  queue: [0, 1],
};

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

  it("shows the landing title before a room exists", () => {
    const html = renderToStaticMarkup(<App />);
    expect(html).toContain('data-testid="landing-page"');
    expect(html).toContain('data-testid="landing-title"');
    expect(html).toContain("TABLE TOP POKER");
    expect(html).not.toContain('data-testid="seat-count-picker"');
    expect(html).not.toContain('data-testid="join-panel"');
  });

  it("puts the lobby controls inside the join panel, with no rail and no room-code pill", () => {
    enterRoom(2, null);
    const html = renderToStaticMarkup(<App />);

    expect(html).toContain('data-testid="join-panel"');
    expect(html).toContain('data-placement="join-panel"');
    expect(html).not.toContain('data-placement="rail"');
    expect(html).not.toContain('data-testid="join-code-toggle"');
    expect(html).toContain('data-testid="connection-status"');
  });

  it("keeps Deal hand in the lobby but disabled below two seated players", () => {
    enterRoom(1, null);
    const html = renderToStaticMarkup(<App />);

    expect(html).toMatch(/data-testid="start-hand-button"[^>]*disabled/);
    expect(html).toContain('data-testid="end-session-button"');
  });

  it("offers Next hand on the rail while two players remain", () => {
    enterRoom(2, completeHand);
    const html = renderToStaticMarkup(<App />);

    expect(html).toContain('data-testid="next-hand-button"');
    expect(html).not.toMatch(/data-testid="next-hand-button"[^>]*disabled/);
  });

  it("disables Next hand once the table drops below two players", () => {
    enterRoom(1, completeHand);
    const html = renderToStaticMarkup(<App />);

    expect(html).toMatch(/data-testid="next-hand-button"[^>]*disabled/);
    expect(html).toContain("Waiting for at least two players");
  });

  it("disables Next hand when a seated player has dropped off the network", () => {
    enterRoom(2, completeHand);
    store.overrides = {
      ...store.overrides,
      seats: [seat(0, true), { ...seat(1, true), disconnected: true }],
    };
    const html = renderToStaticMarkup(<App />);

    expect(html).toMatch(/data-testid="next-hand-button"[^>]*disabled/);
  });

  it("counts a seat waiting for the next hand as a player, since the deal will include it", () => {
    enterRoom(2, completeHand);
    store.overrides = {
      ...store.overrides,
      seats: [
        seat(0, true),
        {
          ...seat(1, true),
          sittingOut: true,
          sittingOutReason: "waiting-for-next-hand",
        },
      ],
    };
    const html = renderToStaticMarkup(<App />);

    expect(html).not.toMatch(/data-testid="next-hand-button"[^>]*disabled/);
  });

  it("plays showdown on the seats", () => {
    enterRoom(2, showdownHand);
    const html = renderToStaticMarkup(<App />);

    expect(html).toContain('data-testid="seat-pod-0-showdown"');
    expect(html).toContain('data-testid="next-hand-button"');
  });

  it("withholds Next hand while the showing window is open", () => {
    enterRoom(2, openWindow);
    const showing = renderToStaticMarkup(<App />);

    expect(showing).toContain('data-testid="showdown-in-progress-hint"');
    expect(showing).not.toContain('data-testid="next-hand-button"');

    enterRoom(2, showdownHand);
    const closed = renderToStaticMarkup(<App />);

    expect(closed).not.toContain('data-testid="showdown-in-progress-hint"');
    expect(closed).toContain('data-testid="next-hand-button"');
  });

  it("keeps the table board visible after a fold-out ending", () => {
    enterRoom(2, completeHand);
    const html = renderToStaticMarkup(<App />);

    expect(html).not.toContain('data-testid="hand-complete-banner"');
    expect(html).toContain('data-testid="community-cards"');
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

  it("shows the test-mode Add bot control only when configured", () => {
    enterRoom(2, null);
    expect(renderToStaticMarkup(<App />)).not.toContain(
      'data-testid="add-bot-button"',
    );

    enterRoom(2, null, true);
    expect(renderToStaticMarkup(<App />)).toContain(
      'data-testid="add-bot-button"',
    );
  });

  it("shows the not-recording banner once recording has stopped, and hides it otherwise", () => {
    enterRoom(2, liveHand);
    expect(renderToStaticMarkup(<App />)).not.toContain(
      'data-testid="not-recording-banner"',
    );

    enterRoom(2, liveHand);
    store.overrides = { ...store.overrides, recordingStopped: true };
    expect(renderToStaticMarkup(<App />)).toContain(
      'data-testid="not-recording-banner"',
    );
  });
});
