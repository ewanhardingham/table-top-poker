import type { SeatView } from "@table-top-poker/protocol";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { HouseRulesSheet } from "./HouseRulesSheet.js";

const seats: SeatView[] = [
  { id: 0, claimed: true, sittingOut: false, disconnected: false },
  { id: 1, claimed: false, sittingOut: false, disconnected: false },
  { id: 2, claimed: false, sittingOut: false, disconnected: false },
  { id: 3, claimed: true, sittingOut: true, disconnected: false },
  { id: 4, claimed: false, sittingOut: false, disconnected: false },
  { id: 5, claimed: true, sittingOut: false, disconnected: true },
  { id: 6, claimed: false, sittingOut: false, disconnected: false },
  { id: 7, claimed: false, sittingOut: false, disconnected: false },
];

const noop = () => {
  /* unused */
};

describe("HouseRulesSheet", () => {
  it("shows the chosen house-rules surface and a repack preview", () => {
    const html = renderToStaticMarkup(
      <HouseRulesSheet
        seatCount={8}
        pendingSeatCount={4}
        seats={seats}
        handLive
        onApply={noop}
        onClose={noop}
      />,
    );

    expect(html).toContain('data-testid="house-rules-sheet"');
    expect(html).toContain("House rules");
    expect(html).toContain("Seat 4→2");
    expect(html).toContain("Seat 6→3");
    expect(html).toContain("Applies from the next hand");
  });

  it("disables decrement at the no-eviction floor", () => {
    const html = renderToStaticMarkup(
      <HouseRulesSheet
        seatCount={8}
        pendingSeatCount={3}
        seats={seats}
        handLive
        onApply={noop}
        onClose={noop}
      />,
    );

    expect(html).toMatch(/data-testid="seat-count-decrement"[^>]*disabled=""/);
    expect(html).toContain("Between 3 and 8 seats.");
    expect(html).toContain("3 seated");
    expect(html).not.toContain("no one is evicted here");
    expect(html).not.toContain("Everyone keeps the seat they are in.");
  });

  it("labels a growth as immediate", () => {
    const html = renderToStaticMarkup(
      <HouseRulesSheet
        seatCount={4}
        pendingSeatCount={null}
        seats={seats.slice(0, 4)}
        handLive
        onApply={noop}
        onClose={noop}
      />,
    );

    expect(html).toContain("Applies immediately");
  });
});
