import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { StatusBar } from "./StatusBar.js";

const noop = () => undefined;

const handlers = {
  inLiveHand: false,
  onToggleSittingOut: noop,
  onLeave: noop,
} as const;

describe("StatusBar", () => {
  it("hides the connection badge before a seat is claimed", () => {
    const html = renderToStaticMarkup(
      <StatusBar
        showBadge={false}
        connectionStatus="disconnected"
        {...handlers}
        seat={null}
      />,
    );
    expect(html).not.toContain('data-testid="connection-status"');
  });

  it("shows the connection badge once connecting begins", () => {
    const html = renderToStaticMarkup(
      <StatusBar
        showBadge={true}
        connectionStatus="connected"
        {...handlers}
        seat={null}
      />,
    );
    expect(html).toContain('data-testid="connection-status"');
    expect(html).toContain("connected");
    expect(html).toContain("height:30px");
  });

  it("shows the seat chip, badge, and menu together on the same row", () => {
    const html = renderToStaticMarkup(
      <StatusBar
        showBadge={true}
        connectionStatus="connected"
        {...handlers}
        seat={{ seatId: 0, sittingOut: false, sittingOutReason: null }}
      />,
    );

    expect(html).toContain('data-testid="seat-panel"');
    expect(html).toContain("Seat 1");
    // Seat chip, connection badge and menu button all live in the header row.
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
        {...handlers}
        seat={null}
      />,
    );
    expect(html).not.toContain('data-testid="seat-panel"');
    expect(html).not.toContain('data-testid="player-menu-button"');
  });
});
