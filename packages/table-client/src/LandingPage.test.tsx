import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { LandingPage } from "./LandingPage.js";

describe("LandingPage", () => {
  it("centres the title above the create-room action", () => {
    const html = renderToStaticMarkup(
      <LandingPage onCreateRoom={() => undefined} />,
    );

    expect(html).toContain('data-testid="landing-title"');
    expect(html).toContain("TABLE TOP POKER");
    expect(html).toContain("font-weight:800");
    expect(html).toContain("color:#ffffff");
    expect(html).toContain("white-space:nowrap");
    expect(html).toContain('data-testid="create-room-button"');
    expect(html.indexOf("TABLE TOP POKER")).toBeLessThan(
      html.indexOf("Create room"),
    );
  });
});
