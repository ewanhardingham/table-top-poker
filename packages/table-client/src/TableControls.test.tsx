import { color } from "@table-top-poker/ui-shared";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { TableControls } from "./TableControls.js";

const noop = () => undefined;

describe("TableControls", () => {
  it("shows Deal hand when a hand can start, and always shows End session", () => {
    const html = renderToStaticMarkup(
      <TableControls
        canStartHand
        handComplete={false}
        canDealNextHand
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
        canDealNextHand
        onStartHand={noop}
        onNextHand={noop}
        onEndSession={noop}
      />,
    );
    expect(html).not.toContain('data-testid="start-hand-button"');
    expect(html).toContain('data-testid="next-hand-button"');
  });

  it("withholds Next hand while the showing window is open", () => {
    const awaiting = renderToStaticMarkup(
      <TableControls
        canStartHand={false}
        handComplete
        canDealNextHand
        awaitingShowdown
        onStartHand={noop}
        onNextHand={noop}
        onEndSession={noop}
      />,
    );
    expect(awaiting).toContain('data-testid="showdown-in-progress-hint"');
    expect(awaiting).not.toContain('data-testid="next-hand-button"');

    const closed = renderToStaticMarkup(
      <TableControls
        canStartHand={false}
        handComplete
        canDealNextHand
        onStartHand={noop}
        onNextHand={noop}
        onEndSession={noop}
      />,
    );
    expect(closed).not.toContain('data-testid="showdown-in-progress-hint"');
    expect(closed).toContain('data-testid="next-hand-button"');
  });

  it("surfaces the engine's reason when the table deals too early", () => {
    const html = renderToStaticMarkup(
      <TableControls
        canStartHand={false}
        handComplete
        canDealNextHand
        awaitingShowdown
        rejectionHint="The hands are still being turned over"
        onStartHand={noop}
        onNextHand={noop}
        onEndSession={noop}
      />,
    );
    expect(html).toContain("The hands are still being turned over");
  });

  it("shows neither deal control mid-hand", () => {
    const html = renderToStaticMarkup(
      <TableControls
        canStartHand={false}
        handComplete={false}
        canDealNextHand
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
        canDealNextHand
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
        canDealNextHand
        onStartHand={noop}
        onNextHand={noop}
        onEndSession={noop}
      />,
    );

    expect(html).toMatch(/data-testid="start-hand-button"[^>]*disabled/);
    expect(html).toContain(`background:${color.controlFill}`);
    expect(html).toContain('data-testid="end-session-button"');
  });

  it("keeps Next hand enabled while enough players are dealt in", () => {
    const html = renderToStaticMarkup(
      <TableControls
        canStartHand={false}
        handComplete
        canDealNextHand
        onStartHand={noop}
        onNextHand={noop}
        onEndSession={noop}
      />,
    );

    expect(html).not.toMatch(/data-testid="next-hand-button"[^>]*disabled/);
    expect(html).not.toContain('data-testid="next-hand-blocked-hint"');
  });

  it("disables Next hand and says why below two players", () => {
    const html = renderToStaticMarkup(
      <TableControls
        canStartHand={false}
        handComplete
        canDealNextHand={false}
        onStartHand={noop}
        onNextHand={noop}
        onEndSession={noop}
      />,
    );

    expect(html).toMatch(/data-testid="next-hand-button"[^>]*disabled/);
    expect(html).toContain(`background:${color.controlFill}`);
    expect(html).toContain("Waiting for at least two players");
  });

  it("shows Add bot only when test mode is enabled", () => {
    const off = renderToStaticMarkup(
      <TableControls
        canStartHand={false}
        handComplete={false}
        canDealNextHand={false}
        onStartHand={noop}
        onNextHand={noop}
        onEndSession={noop}
        onAddBot={noop}
      />,
    );
    const on = renderToStaticMarkup(
      <TableControls
        canStartHand={false}
        handComplete={false}
        canDealNextHand={false}
        testMode
        onStartHand={noop}
        onNextHand={noop}
        onEndSession={noop}
        onAddBot={noop}
      />,
    );

    expect(off).not.toContain('data-testid="add-bot-button"');
    expect(on).toContain('data-testid="add-bot-button"');
    expect(on).toContain("Add bot");
  });

  it("hides Review hands before any hand has been played, even though Deal hand can start", () => {
    const html = renderToStaticMarkup(
      <TableControls
        canStartHand
        handComplete={false}
        canDealNextHand
        onStartHand={noop}
        onNextHand={noop}
        onEndSession={noop}
        onReviewHands={noop}
      />,
    );
    expect(html).not.toContain('data-testid="review-hands-button"');
  });

  it("shows Review hands once the hand is complete", () => {
    const html = renderToStaticMarkup(
      <TableControls
        canStartHand={false}
        handComplete
        canDealNextHand
        onStartHand={noop}
        onNextHand={noop}
        onEndSession={noop}
        onReviewHands={noop}
      />,
    );
    expect(html).toContain('data-testid="review-hands-button"');
  });

  it("hides Review hands while a hand is live and not yet complete", () => {
    const html = renderToStaticMarkup(
      <TableControls
        canStartHand={false}
        handComplete={false}
        canDealNextHand
        onStartHand={noop}
        onNextHand={noop}
        onEndSession={noop}
        onReviewHands={noop}
      />,
    );
    expect(html).not.toContain('data-testid="review-hands-button"');
  });

  it("hides Review hands entirely when no handler is supplied", () => {
    const html = renderToStaticMarkup(
      <TableControls
        canStartHand
        handComplete={false}
        canDealNextHand
        onStartHand={noop}
        onNextHand={noop}
        onEndSession={noop}
      />,
    );
    expect(html).not.toContain('data-testid="review-hands-button"');
  });
});
