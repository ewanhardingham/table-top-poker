import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { StatusBar } from "./StatusBar.js";

const noop = () => undefined;

const handlers = {
  inLiveHand: false,
  onToggleSittingOut: noop,
  onLeave: noop,
  turnSoundRecorded: false,
  turnSoundDisabled: false,
  onEditTurnSound: noop,
  onRemoveTurnSound: noop,
} as const;

const seated = {
  seatId: 0,
  sittingOut: false,
  sittingOutReason: null,
} as const;

describe("StatusBar", () => {
  it("hides the connection badge before a seat is claimed", () => {
    const html = renderToStaticMarkup(
      <StatusBar
        showBadge={false}
        connectionStatus="disconnected"
        hasEverConnected={false}
        {...handlers}
        seat={null}
      />,
    );
    expect(html).not.toContain('data-testid="connection-status"');
  });

  it("stays silent while the connection is healthy", () => {
    const html = renderToStaticMarkup(
      <StatusBar
        showBadge={true}
        connectionStatus="connected"
        hasEverConnected={true}
        {...handlers}
        seat={seated}
      />,
    );
    expect(html).not.toContain('data-testid="connection-status"');
  });

  it("shows the badge when a live connection drops", () => {
    const html = renderToStaticMarkup(
      <StatusBar
        showBadge={true}
        connectionStatus="disconnected"
        hasEverConnected={true}
        {...handlers}
        seat={seated}
      />,
    );
    expect(html).toContain('data-testid="connection-status"');
    expect(html).toContain("disconnected");
    expect(html).toContain("height:30px");
  });

  it("does not warn about a connection never yet made", () => {
    const badgeShown = (
      connectionStatus: "disconnected" | "connecting",
      hasEverConnected: boolean,
    ) =>
      renderToStaticMarkup(
        <StatusBar
          showBadge={true}
          connectionStatus={connectionStatus}
          hasEverConnected={hasEverConnected}
          {...handlers}
          seat={seated}
        />,
      ).includes('data-testid="connection-status"');

    for (const connectionStatus of ["disconnected", "connecting"] as const) {
      expect(badgeShown(connectionStatus, false), connectionStatus).toBe(false);
      expect(badgeShown(connectionStatus, true), connectionStatus).toBe(true);
    }
  });

  it("shows the seat chip and menu together on the same row", () => {
    const html = renderToStaticMarkup(
      <StatusBar
        showBadge={true}
        connectionStatus="disconnected"
        hasEverConnected={true}
        {...handlers}
        seat={seated}
      />,
    );

    expect(html).toContain('data-testid="seat-panel"');
    expect(html).toContain("Seat 1");
    const headerMatch = /<header[^>]*>[\s\S]*<\/header>/.exec(html);
    expect(headerMatch).not.toBeNull();
    expect(headerMatch?.[0]).toContain('data-testid="seat-panel"');
    expect(headerMatch?.[0]).toContain('data-testid="connection-status"');
    expect(headerMatch?.[0]).toContain('data-testid="player-menu-button"');
  });

  it("omits the seat chip and menu before a seat is claimed", () => {
    const html = renderToStaticMarkup(
      <StatusBar
        showBadge={false}
        connectionStatus="disconnected"
        hasEverConnected={false}
        {...handlers}
        seat={null}
      />,
    );
    expect(html).not.toContain('data-testid="seat-panel"');
    expect(html).not.toContain('data-testid="player-menu-button"');
  });

  it("reserves a column for the menu that content cannot consume", () => {
    const html = renderToStaticMarkup(
      <StatusBar
        showBadge={true}
        connectionStatus="disconnected"
        hasEverConnected={true}
        {...handlers}
        seat={{
          seatId: 5,
          displayName: "Bartholomew",
          sittingOut: true,
          sittingOutReason: "waiting-for-next-hand",
        }}
      />,
    );

    const header = /<header[^>]*>/.exec(html)?.[0] ?? "";
    expect(header).toContain("display:grid");
    expect(header).toContain("grid-template-columns:minmax(0, 1fr) auto");

    const seatPanel =
      /<div[^>]*data-testid="seat-panel"[^>]*>/.exec(html)?.[0] ?? "";
    expect(seatPanel).toContain("min-width:0");
    expect(seatPanel).not.toContain("flex:none");
  });

  it("keeps the menu with every pill showing at once", () => {
    const html = renderToStaticMarkup(
      <StatusBar
        showBadge={true}
        connectionStatus="disconnected"
        hasEverConnected={true}
        {...handlers}
        seat={{
          seatId: 5,
          displayName: "Bartholomew",
          sittingOut: true,
          sittingOutReason: "waiting-for-next-hand",
        }}
      />,
    );

    expect(html).toContain('data-testid="claimed-seat"');
    expect(html).toContain('data-testid="sitting-out-badge"');
    expect(html).toContain('data-testid="connection-status"');
    expect(html).toContain('data-testid="player-menu-button"');
  });
});
