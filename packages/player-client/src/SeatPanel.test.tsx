import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SeatPanel } from "./SeatPanel.js";
import { playerTopPillStyle } from "./topPillStyle.js";

/**
 * Markup with the tags stripped — the seat pill spans several of them — and
 * its non-breaking spaces normalised, so assertions read as plain text.
 */
function textOf(html: string): string {
  return html.replace(/<[^>]*>/g, "").replace(/\u00a0/g, " ");
}

function tagWithTestId(html: string, testId: string): string {
  const tag = new RegExp(`<[a-z]+[^>]*data-testid="${testId}"[^>]*>`).exec(
    html,
  );
  expect(tag, testId).not.toBeNull();
  return tag?.[0] ?? "";
}

describe("SeatPanel", () => {
  it("shows the player's name while retaining the seat number", () => {
    const html = renderToStaticMarkup(
      <SeatPanel seatId={2} displayName="Avery" sittingOut={false} />,
    );

    expect(textOf(html)).toContain("Avery · Seat 3");
  });

  /*
   * The pill truncates from the name end only, so the seat number survives a
   * squeeze (ADR-0006). jsdom has no layout, so the guard is on the structure
   * that produces that: only the name may shrink and clip, and the seat number
   * is fixed. A layout test would pass on a bar that still overflows.
   */
  it("truncates the name, never the seat number", () => {
    const html = renderToStaticMarkup(
      <SeatPanel seatId={2} displayName="Bartholomew" sittingOut={false} />,
    );

    const name = tagWithTestId(html, "claimed-seat-name");
    expect(name).toContain("min-width:0");
    expect(name).toContain("overflow:hidden");
    expect(name).toContain("text-overflow:ellipsis");

    // The seat number's own span is fixed, so it is never the part clipped.
    const seatNumber = /<span style="flex:none">[^<]*Seat 3<\/span>/.exec(html);
    expect(seatNumber).not.toBeNull();
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
    // Short by design: the label shares a narrow row with the seat pill and
    // the menu, and "waiting" here can only mean the next hand (ADR-0006).
    expect(html).toContain("Waiting");
    expect(html).not.toContain("Waiting for next hand");
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
