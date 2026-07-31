import { DEFAULT_SEAT_COUNT } from "@table-top-poker/protocol";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { App } from "./App.js";

describe("App", () => {
  it("renders the table-client shell", () => {
    const html = renderToStaticMarkup(<App />);
    expect(html).toContain('data-testid="table-client-shell"');
  });

  it("shows a Create room button and hides the connection badge before a room exists", () => {
    const html = renderToStaticMarkup(<App />);
    expect(html).toContain('data-testid="create-room-button"');
    expect(html).not.toContain('data-testid="room-panel"');
    expect(html).not.toContain('data-testid="connection-status"');
  });

  it("picks the table size before the room code or QR is shown", () => {
    const html = renderToStaticMarkup(<App />);
    expect(html).toContain('data-testid="seat-count-picker"');
    expect(html).not.toContain('data-testid="join-panel"');
  });

  it("defaults the picker to a full eight-seat table", () => {
    const html = renderToStaticMarkup(<App />);
    expect(html).toContain(
      `data-testid="seat-count-${String(DEFAULT_SEAT_COUNT)}-button" aria-pressed="true"`,
    );
  });
});
