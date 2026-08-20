import type { SeatView, TableView } from "@table-top-poker/protocol";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { CAPTION_BAND, FELT_LAYER } from "./CaptionStrip.js";
import { TRANSPORT_HEIGHT } from "./ReplayTransport.js";
import { BOTTOM_BAND, ReplayStage, TOP_BAND } from "./ReplayStage.js";

const seats: readonly SeatView[] = [0, 1, 2, 3].map((id) => ({
  id,
  claimed: true,
  sittingOut: false,
  sittingOutReason: null,
  disconnected: false,
}));

const view: TableView = {
  phase: "betting",
  turnEndsAt: null,
  button: 0,
  smallBlind: 1,
  bigBlind: 2,
  dealtSeatCount: 4,
  street: "flop",
  board: [
    { rank: "A", suit: "spades" },
    { rank: "K", suit: "hearts" },
    { rank: "2", suit: "clubs" },
  ],
  toAct: [1],
  seats: seats.map((seat) => ({ seatId: seat.id, folded: false })),
};

describe("ReplayStage", () => {
  it("lays the table out between reserved bands, clear of the transport", () => {
    const html = renderToStaticMarkup(
      <ReplayStage view={view} seats={seats} actionLabels={new Map()} />,
    );

    expect(html).toContain(`top:${String(TOP_BAND)}em`);
    expect(html).toContain(
      `bottom:${String(TRANSPORT_HEIGHT + CAPTION_BAND + BOTTOM_BAND)}em`,
    );
    expect(html).toContain(`z-index:${String(FELT_LAYER)}`);
  });

  it("reserves the Caption's band rather than letting a pod grow into it", () => {
    const feltBottom = TRANSPORT_HEIGHT + CAPTION_BAND + BOTTOM_BAND;
    const captionTop = TRANSPORT_HEIGHT + CAPTION_BAND;

    expect(feltBottom).toBeGreaterThan(captionTop);
    expect(feltBottom - captionTop).toBe(BOTTOM_BAND);
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
