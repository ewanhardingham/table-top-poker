import type { SeatView, TableView } from "@table-top-poker/protocol";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { CAPTION_BAND, FELT_LAYER } from "./CaptionStrip.js";
import { CHROME_UNIT_PROPERTY } from "./chrome.js";
import { TRANSPORT_BAND } from "./ReplayTransport.js";
import {
  EDGE_BAND,
  ReplayStage,
  STAGE_BOTTOM,
  STAGE_TOP,
} from "./ReplayStage.js";

const seats: readonly SeatView[] = [0, 1, 2, 3].map((id) => ({
  id,
  claimed: true,
  sittingOut: false,
  sittingOutReason: null,
  disconnected: false,
}));

const view: TableView = {
  phase: "betting",
  tabled: [],
  turnEndsAt: null,
  button: 0,
  smallBlind: 1,
  bigBlind: 2,
  dealtSeatCount: 4,
  burnedCount: 0,
  street: "flop",
  board: [
    { rank: "A", suit: "spades" },
    { rank: "K", suit: "hearts" },
    { rank: "2", suit: "clubs" },
  ],
  toAct: [1],
  seats: seats.map((seat) => ({
    seatId: seat.id,
    folded: false,
    allIn: false,
  })),
};

describe("ReplayStage", () => {
  it("lays the table out between reserved bands, clear of the transport", () => {
    const html = renderToStaticMarkup(
      <ReplayStage view={view} seats={seats} actionLabels={new Map()} />,
    );

    expect(html).toContain(`top:${STAGE_TOP}`);
    expect(html).toContain(`bottom:${STAGE_BOTTOM}`);
    expect(html).toContain(`z-index:${String(FELT_LAYER)}`);
  });

  it("reserves the Caption's band rather than letting a pod grow into it", () => {
    expect(STAGE_BOTTOM).toContain(TRANSPORT_BAND);
    expect(STAGE_BOTTOM).toContain(CAPTION_BAND);
  });

  it("gives the ring the same margin top and bottom", () => {
    expect(STAGE_TOP).toBe(EDGE_BAND);
    expect(STAGE_BOTTOM).toContain(EDGE_BAND);
    expect(STAGE_BOTTOM).toContain(`var(${CHROME_UNIT_PROPERTY})`);
  });

  it("renders the felt through the live Seats and Board, projected", () => {
    const html = renderToStaticMarkup(
      <ReplayStage view={view} seats={seats} actionLabels={new Map()} />,
    );

    expect(html).toContain('data-testid="seats"');
    expect(html).toContain('data-testid="community-cards"');
    expect(html).toContain('data-phase="betting"');
  });
});

describe("ReplayStage at showdown", () => {
  const showdown: TableView = {
    phase: "showdown",
    turnEndsAt: null,
    queue: [],
    mucked: [],
    button: 0,
    smallBlind: 1,
    bigBlind: 2,
    dealtSeatCount: 4,
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
        rank: 30,
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

  it("replays the shown hand and keeps the concealed one face down", () => {
    const html = renderToStaticMarkup(
      <ReplayStage view={showdown} seats={seats} actionLabels={new Map()} />,
    );

    expect(html).toContain("wins");
    expect(html).not.toContain("Pair of Aces");
    expect(html).toMatch(
      /data-testid="seat-pod-0-showdown"[^>]*data-shown="true"/,
    );
    expect(html).toMatch(
      /data-testid="seat-pod-1-showdown"[^>]*data-shown="false"/,
    );
    expect(html).not.toContain('data-testid="seat-pod-2-showdown"');
  });
});
