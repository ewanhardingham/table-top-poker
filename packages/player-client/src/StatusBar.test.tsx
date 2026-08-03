import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { StatusBar } from "./StatusBar.js";

const noop = () => undefined;

describe("StatusBar", () => {
  it("hides the connection badge before a seat is claimed", () => {
    const html = renderToStaticMarkup(
      <StatusBar
        showBadge={false}
        connectionStatus="disconnected"
        onToggleSittingOut={noop}
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
        onToggleSittingOut={noop}
        seat={null}
      />,
    );
    expect(html).toContain('data-testid="connection-status"');
    expect(html).toContain("connected");
    expect(html).toContain("height:30px");
  });

  it("shows the seat chip alongside the connection badge, on the same row", () => {
    const html = renderToStaticMarkup(
      <StatusBar
        showBadge={true}
        connectionStatus="connected"
        onToggleSittingOut={noop}
        seat={{ seatId: 0, sittingOut: false, sittingOutReason: null }}
      />,
    );

    expect(html).toContain('data-testid="seat-panel"');
    expect(html).toContain("Seat 1");
    // Both live in the same header row, not stacked in separate blocks.
    const headerMatch = /<header[^>]*>[\s\S]*<\/header>/.exec(html);
    expect(headerMatch).not.toBeNull();
    expect(headerMatch?.[0]).toContain('data-testid="seat-panel"');
    expect(headerMatch?.[0]).toContain('data-testid="connection-status"');
  });

  it("omits the seat chip before a seat is claimed", () => {
    const html = renderToStaticMarkup(
      <StatusBar
        showBadge={false}
        connectionStatus="disconnected"
        onToggleSittingOut={noop}
        seat={null}
      />,
    );
    expect(html).not.toContain('data-testid="seat-panel"');
  });
});
