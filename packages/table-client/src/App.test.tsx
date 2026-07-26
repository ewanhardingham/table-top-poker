import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { App } from "./App.js";

describe("App", () => {
  it("renders the table-client shell with a connection badge", () => {
    const html = renderToStaticMarkup(<App />);
    expect(html).toContain('data-testid="table-client-shell"');
    expect(html).toContain('data-testid="connection-status"');
  });

  it("shows a Create room button before a room exists", () => {
    const html = renderToStaticMarkup(<App />);
    expect(html).toContain('data-testid="create-room-button"');
    expect(html).not.toContain('data-testid="room-panel"');
  });
});
