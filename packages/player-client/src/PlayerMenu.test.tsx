import { color } from "@table-top-poker/ui-shared";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { MenuBody, PlayerMenu, leaveConfirmMessage } from "./PlayerMenu.js";

const noop = () => undefined;

const bodyHandlers = {
  onClose: noop,
  onSitOut: noop,
  onStartConfirm: noop,
  onCancelConfirm: noop,
  onConfirmLeave: noop,
} as const;

describe("PlayerMenu", () => {
  it("renders a closed burger button with no drawer", () => {
    const html = renderToStaticMarkup(
      <PlayerMenu
        sittingOut={false}
        sitOutDisabled={false}
        inLiveHand={false}
        onToggleSittingOut={noop}
        onLeave={noop}
      />,
    );

    expect(html).toContain('data-testid="player-menu-button"');
    expect(html).toContain('aria-expanded="false"');
    expect(html).not.toContain('data-testid="player-menu-drawer"');
  });
});

describe("MenuBody", () => {
  it("offers sit out while active and sit in while sitting out", () => {
    const active = renderToStaticMarkup(
      <MenuBody
        sittingOut={false}
        sitOutDisabled={false}
        inLiveHand={false}
        confirmingLeave={false}
        {...bodyHandlers}
      />,
    );
    const sittingOut = renderToStaticMarkup(
      <MenuBody
        sittingOut={true}
        sitOutDisabled={false}
        inLiveHand={false}
        confirmingLeave={false}
        {...bodyHandlers}
      />,
    );

    expect(active).toContain('data-testid="menu-sit-out"');
    expect(active).toContain("Sit out");
    expect(sittingOut).toContain("Sit in");
  });

  it("offers all card backs as a device-only preference", () => {
    const html = renderToStaticMarkup(
      <MenuBody
        sittingOut={false}
        sitOutDisabled={false}
        inLiveHand={false}
        confirmingLeave={false}
        {...bodyHandlers}
      />,
    );

    expect(html).toContain('data-testid="player-card-back-settings"');
    expect(html.match(/data-testid="card-back-option-/g)).toHaveLength(9);
    expect(html).toContain("this device only");
  });

  it("disables sit out when the socket is down, but never the leave action", () => {
    const html = renderToStaticMarkup(
      <MenuBody
        sittingOut={false}
        sitOutDisabled={true}
        inLiveHand={false}
        confirmingLeave={false}
        {...bodyHandlers}
      />,
    );

    expect(html).toMatch(/data-testid="menu-sit-out"[^>]*disabled/);
    expect(html).toContain('data-testid="menu-leave"');
    expect(html).not.toMatch(/data-testid="menu-leave"[^>]*disabled/);
  });

  it("shows the leave action, not a confirmation, until leave is chosen", () => {
    const html = renderToStaticMarkup(
      <MenuBody
        sittingOut={false}
        sitOutDisabled={false}
        inLiveHand={false}
        confirmingLeave={false}
        {...bodyHandlers}
      />,
    );

    expect(html).toContain('data-testid="menu-leave"');
    expect(html).toContain("Leave game");
    expect(html).not.toContain('data-testid="leave-confirm"');
  });

  it("swaps in the confirmation with context-aware copy once confirming", () => {
    const inHand = renderToStaticMarkup(
      <MenuBody
        sittingOut={false}
        sitOutDisabled={false}
        inLiveHand={true}
        confirmingLeave={true}
        {...bodyHandlers}
      />,
    );
    const outOfHand = renderToStaticMarkup(
      <MenuBody
        sittingOut={false}
        sitOutDisabled={false}
        inLiveHand={false}
        confirmingLeave={true}
        {...bodyHandlers}
      />,
    );

    expect(inHand).toContain('data-testid="leave-confirm"');
    expect(inHand).toContain("forfeit the current hand");
    expect(inHand).toContain('data-testid="leave-confirm-yes"');
    expect(inHand).toContain('data-testid="leave-confirm-cancel"');
    expect(inHand).not.toContain('data-testid="menu-leave"');
    expect(outOfHand).toContain("Leave the game?");
  });

  it("styles the leave action against the accent, not the neutral fill", () => {
    const html = renderToStaticMarkup(
      <MenuBody
        sittingOut={false}
        sitOutDisabled={false}
        inLiveHand={false}
        confirmingLeave={false}
        {...bodyHandlers}
      />,
    );

    const leaveButton = /<button[^>]*data-testid="menu-leave"[^>]*>/.exec(html);
    expect(leaveButton?.[0]).toContain(color.accentWash);
  });
});

describe("leaveConfirmMessage", () => {
  it("warns about forfeiting only while in a live hand", () => {
    expect(leaveConfirmMessage(true)).toContain("forfeit");
    expect(leaveConfirmMessage(false)).toBe("Leave the game?");
  });
});
