import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { TableControls } from "./TableControls.js";

const noop = () => {
  /* unused in these tests */
};

describe("TableControls", () => {
  it("shows Deal hand when a hand can start, and always shows End session", () => {
    const html = renderToStaticMarkup(
      <TableControls
        canStartHand
        handComplete={false}
        onStartHand={noop}
        onNextHand={noop}
        onEndSession={noop}
      />,
    );
    expect(html).toContain('data-testid="start-hand-button"');
    expect(html).not.toContain('data-testid="next-hand-button"');
    expect(html).toContain('data-testid="end-session-button"');
  });

  it("shows Next hand once the hand is complete, not Deal hand", () => {
    const html = renderToStaticMarkup(
      <TableControls
        canStartHand={false}
        handComplete
        onStartHand={noop}
        onNextHand={noop}
        onEndSession={noop}
      />,
    );
    expect(html).not.toContain('data-testid="start-hand-button"');
    expect(html).toContain('data-testid="next-hand-button"');
  });

  it("shows neither deal control mid-hand", () => {
    const html = renderToStaticMarkup(
      <TableControls
        canStartHand={false}
        handComplete={false}
        onStartHand={noop}
        onNextHand={noop}
        onEndSession={noop}
      />,
    );
    expect(html).not.toContain('data-testid="start-hand-button"');
    expect(html).not.toContain('data-testid="next-hand-button"');
    expect(html).toContain('data-testid="end-session-button"');
  });
});
