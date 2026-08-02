import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { CheckStamp } from "./CheckStamp.js";

describe("CheckStamp", () => {
  it("renders the prototype's checked stamp as a non-interactive card overlay", () => {
    const html = renderToStaticMarkup(<CheckStamp />);

    expect(html).toContain('data-testid="check-stamp"');
    expect(html).toContain('class="hole-cards-check-stamp"');
    expect(html).toContain('aria-hidden="true"');
    expect(html).toContain("CHECKED");
    expect(html).toContain("✓");
  });
});
