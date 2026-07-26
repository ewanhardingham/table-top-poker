import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { App } from "./App.js";

describe("App", () => {
  it("renders the player-client shell with a connection badge", () => {
    const html = renderToStaticMarkup(<App />);
    expect(html).toContain('data-testid="player-client-shell"');
    expect(html).toContain('data-testid="connection-status"');
  });

  it("shows the join form before a room is joined", () => {
    const html = renderToStaticMarkup(<App />);
    expect(html).toContain('data-testid="join-form"');
    expect(html).not.toContain('data-testid="seat-picker"');
    expect(html).not.toContain('data-testid="seat-panel"');
  });
});
