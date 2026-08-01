import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SeatPanel } from "./SeatPanel.js";

const noop = () => undefined;

describe("SeatPanel", () => {
  it("shows the player's name while retaining the seat number", () => {
    const html = renderToStaticMarkup(
      <SeatPanel
        seatId={2}
        displayName="Avery"
        sittingOut={false}
        toggleDisabled={false}
        onToggleSittingOut={noop}
      />,
    );

    expect(html).toContain("Avery · Seat 3");
  });

  it("shows the claimed seat", () => {
    const html = renderToStaticMarkup(
      <SeatPanel
        seatId={2}
        sittingOut={false}
        toggleDisabled={false}
        onToggleSittingOut={noop}
      />,
    );
    expect(html).toContain('data-testid="claimed-seat"');
    expect(html).toContain("Seat 3");
    expect(html).not.toContain('data-testid="sitting-out-badge"');
  });

  it("shows a sitting-out badge when joined mid-hand", () => {
    const html = renderToStaticMarkup(
      <SeatPanel
        seatId={2}
        sittingOut={true}
        sittingOutReason="waiting-for-next-hand"
        toggleDisabled={false}
        onToggleSittingOut={noop}
      />,
    );
    expect(html).toContain('data-testid="sitting-out-badge"');
    expect(html).toContain("Waiting for next hand");
  });

  it("offers sit out while active and sit in while sitting out", () => {
    const active = renderToStaticMarkup(
      <SeatPanel
        seatId={0}
        sittingOut={false}
        toggleDisabled={false}
        onToggleSittingOut={noop}
      />,
    );
    const sittingOut = renderToStaticMarkup(
      <SeatPanel
        seatId={0}
        sittingOut={true}
        toggleDisabled={false}
        onToggleSittingOut={noop}
      />,
    );

    expect(active).toContain('data-testid="sitting-out-toggle"');
    expect(active).toContain("Sit out");
    expect(sittingOut).toContain("Sit in");
  });

  it("disables the toggle while the socket is reconnecting", () => {
    const html = renderToStaticMarkup(
      <SeatPanel
        seatId={0}
        sittingOut={false}
        toggleDisabled={true}
        onToggleSittingOut={noop}
      />,
    );

    expect(html).toMatch(/data-testid="sitting-out-toggle"[^>]*disabled/);
  });
});
