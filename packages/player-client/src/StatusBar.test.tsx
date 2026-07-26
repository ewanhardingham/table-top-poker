import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { StatusBar } from "./StatusBar.js";

describe("StatusBar", () => {
  it("hides the connection badge before a seat is claimed", () => {
    const html = renderToStaticMarkup(
      <StatusBar showBadge={false} connectionStatus="disconnected" />,
    );
    expect(html).not.toContain('data-testid="connection-status"');
  });

  it("shows the connection badge once connecting begins", () => {
    const html = renderToStaticMarkup(
      <StatusBar showBadge={true} connectionStatus="connected" />,
    );
    expect(html).toContain('data-testid="connection-status"');
    expect(html).toContain("connected");
  });
});
