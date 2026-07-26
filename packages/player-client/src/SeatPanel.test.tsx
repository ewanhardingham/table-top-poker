import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SeatPanel } from "./SeatPanel.js";

describe("SeatPanel", () => {
  it("shows the claimed seat", () => {
    const html = renderToStaticMarkup(
      <SeatPanel seatId={2} sittingOut={false} />,
    );
    expect(html).toContain('data-testid="claimed-seat"');
    expect(html).toContain("Seat 3");
    expect(html).not.toContain('data-testid="sitting-out-badge"');
  });

  it("shows a sitting-out badge when joined mid-hand", () => {
    const html = renderToStaticMarkup(
      <SeatPanel seatId={2} sittingOut={true} />,
    );
    expect(html).toContain('data-testid="sitting-out-badge"');
  });
});
