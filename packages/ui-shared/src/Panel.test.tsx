import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Panel } from "./Panel.js";

describe("Panel", () => {
  it("renders its children", () => {
    const html = renderToStaticMarkup(
      <Panel>
        <span>Table settings</span>
      </Panel>,
    );
    expect(html).toContain("Table settings");
  });

  it("blurs its background so content behind it reads as backdrop, not overlay", () => {
    const html = renderToStaticMarkup(<Panel>content</Panel>);
    expect(html).toContain("backdrop-filter:blur(6px)");
  });

  it("lets a caller override style, for shapes that diverge from the base card (e.g. the side-menu drawer)", () => {
    const html = renderToStaticMarkup(
      <Panel style={{ borderRadius: 0 }}>content</Panel>,
    );
    expect(html).toContain("border-radius:0");
  });

  it("passes through standard div attributes", () => {
    const html = renderToStaticMarkup(
      <Panel data-testid="settings-panel">content</Panel>,
    );
    expect(html).toContain('data-testid="settings-panel"');
  });
});
