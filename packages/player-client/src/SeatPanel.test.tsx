import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SeatPanel } from "./SeatPanel.js";
import { playerTopPillStyle } from "./topPillStyle.js";

describe("SeatPanel", () => {
  it("shows the player's name while retaining the seat number", () => {
    const html = renderToStaticMarkup(
      <SeatPanel seatId={2} displayName="Avery" sittingOut={false} />,
    );

    expect(html).toContain("Avery · Seat 3");
  });

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
      <SeatPanel
        seatId={2}
        sittingOut={true}
        sittingOutReason="waiting-for-next-hand"
      />,
    );
    expect(html).toContain('data-testid="sitting-out-badge"');
    expect(html).toContain("Waiting for next hand");
  });

  it("uses the same pill height for the seat and status chips", () => {
    const html = renderToStaticMarkup(
      <SeatPanel
        seatId={0}
        sittingOut={true}
        sittingOutReason="waiting-for-next-hand"
      />,
    );

    for (const testId of ["claimed-seat", "sitting-out-badge"]) {
      const element = new RegExp(`<[a-z]+[^>]*data-testid="${testId}"[^>]*>`);
      expect(element.exec(html)?.[0], testId).toContain(
        `height:${String(playerTopPillStyle.height ?? "")}px`,
      );
    }
  });

  it("carries no seat controls — those live behind the menu", () => {
    const html = renderToStaticMarkup(
      <SeatPanel seatId={0} sittingOut={false} />,
    );

    expect(html).not.toContain("<button");
    expect(html).not.toContain("Sit out");
  });

  it("shows the sitting-out label for a voluntary opt-out", () => {
    const html = renderToStaticMarkup(
      <SeatPanel seatId={0} sittingOut={true} sittingOutReason="voluntary" />,
    );

    expect(html).toContain('data-testid="sitting-out-badge"');
    expect(html).toContain("Sitting out");
  });
});
