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
      />,
    );

    expect(html).toMatch(/data-testid="action-call"[^>]*data-pending="true"/);
    expect(html).toMatch(/data-testid="action-fold"[^>]*disabled/);
    expect(html).not.toContain('data-testid="action-rejection"');
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
      />,
    );

    expect(html).toContain('data-testid="action-rejection"');
    expect(html).toContain('data-rejected-action="check"');
    expect(html).toContain("isn&#x27;t available right now");
  });
});
