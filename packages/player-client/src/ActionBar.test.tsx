import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ActionBar } from "./ActionBar.js";

const noop = () => undefined;

function buttonTag(html: string, action: string): string {
  const match = new RegExp(
    `<button[^>]*data-testid="action-${action}"[^>]*>`,
  ).exec(html);
  if (!match) throw new Error(`no button rendered for ${action}`);
  return match[0];
}

describe("ActionBar", () => {
  it("enables only the legal actions and disables the rest", () => {
    const html = renderToStaticMarkup(
      <ActionBar
        legalActions={["fold", "check", "raise"]}
        pendingAction={null}
        rejection={null}
        onFold={noop}
        onCheck={noop}
        onCall={noop}
        onRaise={noop}
        onAllIn={noop}
        facingAllIn={false}
      />,
    );

    expect(buttonTag(html, "fold")).not.toContain("disabled");
    expect(buttonTag(html, "check")).not.toContain("disabled");
    expect(buttonTag(html, "raise")).not.toContain("disabled");
    expect(buttonTag(html, "call")).toContain("disabled");
  });

  it("disables every button while an action is pending, marking the pending one", () => {
    const html = renderToStaticMarkup(
      <ActionBar
        legalActions={["fold", "check", "call", "raise"]}
        pendingAction="call"
        rejection={null}
        onFold={noop}
        onCheck={noop}
        onCall={noop}
        onRaise={noop}
        onAllIn={noop}
        facingAllIn={false}
      />,
    );

    expect(html).toMatch(/data-testid="action-call"[^>]*data-pending="true"/);
    expect(html).toMatch(/data-testid="action-fold"[^>]*disabled/);
    expect(html).not.toContain('data-testid="action-rejection"');
  });

  it("labels every action with its sub-caption regardless of legality", () => {
    const html = renderToStaticMarkup(
      <ActionBar
        legalActions={["fold", "check", "raise"]}
        pendingAction={null}
        rejection={null}
        onFold={noop}
        onCheck={noop}
        onCall={noop}
        onRaise={noop}
        onAllIn={noop}
        facingAllIn={false}
      />,
    );

    expect(html).toContain("muck");
    expect(html).toContain("no bet");
    expect(html).toContain("match");
    expect(html).toContain("put in more");
  });

  it("offers one wide all-in alongside the four ordinary actions", () => {
    const html = renderToStaticMarkup(
      <ActionBar
        legalActions={["fold", "call", "raise", "allInCall", "allInRaise"]}
        pendingAction={null}
        rejection={null}
        onFold={noop}
        onCheck={noop}
        onCall={noop}
        onRaise={noop}
        onAllIn={noop}
        facingAllIn={false}
      />,
    );

    expect(html).toContain("All in");
    expect(html).not.toContain("All-in call");
  });

  it("splits the all-in once another seat has shoved", () => {
    const html = renderToStaticMarkup(
      <ActionBar
        legalActions={["fold", "call", "raise", "allInCall", "allInRaise"]}
        pendingAction={null}
        rejection={null}
        onFold={noop}
        onCheck={noop}
        onCall={noop}
        onRaise={noop}
        onAllIn={noop}
        facingAllIn
      />,
    );

    expect(html).toContain("All-in call");
    expect(html).toContain("All-in raise");
  });

  it("leaves the all-in row out when it is not the player's turn", () => {
    const html = renderToStaticMarkup(
      <ActionBar
        legalActions={[]}
        pendingAction={null}
        rejection={null}
        onFold={noop}
        onCheck={noop}
        onCall={noop}
        onRaise={noop}
        onAllIn={noop}
        facingAllIn={false}
      />,
    );

    expect(html).not.toContain('data-testid="all-in-row"');
  });

  it("attributes a rejected all-in to the all-in row", () => {
    const html = renderToStaticMarkup(
      <ActionBar
        legalActions={["fold", "call", "raise", "allInCall", "allInRaise"]}
        pendingAction={null}
        rejection={{ action: "allInRaise", reason: "not-your-turn" }}
        onFold={noop}
        onCheck={noop}
        onCall={noop}
        onRaise={noop}
        onAllIn={noop}
        facingAllIn
      />,
    );

    expect(html).toMatch(
      /data-testid="action-rejection"[^>]*data-rejected-action="allInRaise"/,
    );
    expect(html).toContain("It&#x27;s not your turn yet.");
  });

  it("shows the rejection reason inline", () => {
    const html = renderToStaticMarkup(
      <ActionBar
        legalActions={["fold", "check", "raise"]}
        pendingAction={null}
        rejection={{ action: "check", reason: "action-not-legal" }}
        onFold={noop}
        onCheck={noop}
        onCall={noop}
        onRaise={noop}
        onAllIn={noop}
        facingAllIn={false}
      />,
    );

    expect(html).toContain('data-testid="action-rejection"');
    expect(html).toContain('data-rejected-action="check"');
    expect(html).toContain("isn&#x27;t available right now");

    const checkGroupStart = html.indexOf('data-testid="action-group-check"');
    const callGroupStart = html.indexOf('data-testid="action-group-call"');
    const rejectionStart = html.indexOf('data-testid="action-rejection"');
    expect(rejectionStart).toBeGreaterThan(checkGroupStart);
    expect(rejectionStart).toBeLessThan(callGroupStart);
  });

  it("falls back to a bar-level message when no action is attributed", () => {
    const html = renderToStaticMarkup(
      <ActionBar
        legalActions={[]}
        pendingAction={null}
        rejection={{ action: null, reason: "hand-not-in-progress" }}
        onFold={noop}
        onCheck={noop}
        onCall={noop}
        onRaise={noop}
        onAllIn={noop}
        facingAllIn={false}
      />,
    );

    expect(html).toContain('data-testid="action-rejection"');
    expect(html).toContain('data-rejected-action=""');
  });
});
