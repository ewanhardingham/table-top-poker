import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SeatMenu } from "./SeatMenu.js";

const noop = () => {
  /* unused in these tests */
};

describe("SeatMenu", () => {
  it("shows the seat number and an Evict action", () => {
    const html = renderToStaticMarkup(
      <SeatMenu seatId={2} seatCount={8} onEvict={noop} onDismiss={noop} />,
    );
    expect(html).toContain('data-testid="seat-menu-2"');
    expect(html).toContain("Seat 3");
    expect(html).toContain('data-testid="evict-seat-2-button"');
    expect(html).toContain("Evict");
  });

  it("shows the player's name while retaining the seat number", () => {
    const html = renderToStaticMarkup(
      <SeatMenu
        seatId={2}
        seatCount={8}
        displayName="Avery"
        onEvict={noop}
        onDismiss={noop}
      />,
    );

    expect(html).toContain("Avery · Seat 3");
  });

  it("renders a full-screen backdrop for dismissal", () => {
    const html = renderToStaticMarkup(
      <SeatMenu seatId={0} seatCount={8} onEvict={noop} onDismiss={noop} />,
    );
    expect(html).toContain('data-testid="seat-menu-backdrop"');
  });
});
