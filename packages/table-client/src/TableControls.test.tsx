import { color } from "@table-top-poker/ui-shared";
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

  it("places lobby controls below the join panel", () => {
    const html = renderToStaticMarkup(
      <TableControls
        placement="join-panel"
        canStartHand
        handComplete={false}
        onStartHand={noop}
        onNextHand={noop}
        onEndSession={noop}
      />,
    );

    expect(html).toContain('data-placement="join-panel"');
    expect(html).toContain("flex-direction:row");
    expect(html).not.toContain("position:absolute");
    expect(html).toContain('data-testid="start-hand-button"');
    expect(html).toContain('data-testid="end-session-button"');
  });

  it("keeps Deal hand visible but disabled until enough players are seated", () => {
    const html = renderToStaticMarkup(
      <TableControls
        placement="join-panel"
        canStartHand={false}
        handComplete={false}
        onStartHand={noop}
        onNextHand={noop}
        onEndSession={noop}
      />,
    );

    expect(html).toMatch(/data-testid="start-hand-button"[^>]*disabled/);
    expect(html).toContain(`background:${color.controlFill}`);
    expect(html).toContain('data-testid="end-session-button"');
  });
});
