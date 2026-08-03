import { color } from "@table-top-poker/ui-shared";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SeatPanel } from "./SeatPanel.js";
import { playerTopPillStyle } from "./topPillStyle.js";

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

  it("uses the same pill height for the seat, sit-out, and toggle controls", () => {
    const html = renderToStaticMarkup(
      <SeatPanel
        seatId={0}
        sittingOut={true}
        sittingOutReason="waiting-for-next-hand"
        toggleDisabled={false}
        onToggleSittingOut={noop}
      />,
    );

    for (const testId of [
      "claimed-seat",
      "sitting-out-badge",
      "sitting-out-toggle",
    ]) {
      const element = new RegExp(`<[a-z]+[^>]*data-testid="${testId}"[^>]*>`);
      expect(element.exec(html)?.[0], testId).toContain(
        `height:${String(playerTopPillStyle.height ?? "")}px`,
      );
    }
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

  it("styles the sit-out control as an action rather than a status badge", () => {
    const html = renderToStaticMarkup(
      <SeatPanel
        seatId={0}
        sittingOut={false}
        toggleDisabled={false}
        onToggleSittingOut={noop}
      />,
    );

    const buttonMatch =
      /<button[^>]*data-testid="sitting-out-toggle"[^>]*>/.exec(html);
    expect(buttonMatch?.[0]).toContain("background:rgba(229,68,60,.07)");
    expect(buttonMatch?.[0]).toContain("border:1px solid rgba(229,68,60,.32)");
    expect(buttonMatch?.[0]).toContain("cursor:pointer");
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

    // The disabled fill comes from PillButton, not from SeatPanel — the accent
    // treatment must not survive into the disabled state.
    const buttonMatch =
      /<button[^>]*data-testid="sitting-out-toggle"[^>]*>/.exec(html);
    expect(buttonMatch?.[0]).toContain(`background:${color.controlFill}`);
    expect(buttonMatch?.[0]).toContain(`color:${color.disabledText}`);
    expect(buttonMatch?.[0]).not.toContain("cursor:pointer");
  });
});
