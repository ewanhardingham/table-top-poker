import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SettingsToggle } from "./SettingsToggle.js";

describe("SettingsToggle", () => {
  it("renders a 52px-style three-bar settings control", () => {
    const html = renderToStaticMarkup(
      <SettingsToggle open={false} onToggle={() => undefined} />,
    );

    expect(html).toContain('data-testid="settings-toggle"');
    expect(html).toContain('aria-label="Open table settings"');
    expect(html.match(/width:20px/g)).toHaveLength(3);
  });
});
