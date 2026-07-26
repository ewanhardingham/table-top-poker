import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { StatusBar } from "./StatusBar.js";

describe("StatusBar", () => {
  it("hides the connection badge before a room exists", () => {
    const html = renderToStaticMarkup(
      <StatusBar roomCode={null} connectionStatus="disconnected" />,
    );
    expect(html).not.toContain('data-testid="connection-status"');
  });

  it("shows the connection badge once a room exists", () => {
    const html = renderToStaticMarkup(
      <StatusBar roomCode="ABCD" connectionStatus="connected" />,
    );
    expect(html).toContain('data-testid="connection-status"');
    expect(html).toContain("connected");
  });
});
