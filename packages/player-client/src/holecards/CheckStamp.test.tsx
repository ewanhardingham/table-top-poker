import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { CheckStamp } from "./CheckStamp.js";

describe("CheckStamp", () => {
  it("says the Action, so the confirmation is legible without the ActionBar", () => {
    const html = renderToStaticMarkup(<CheckStamp />);

    expect(html).toContain("CHECKED");
  });

  it("takes no pointer, so a tap over it still reaches the cards", () => {
    const html = renderToStaticMarkup(<CheckStamp />);

    expect(html).toContain("pointer-events:none");
  });

  it("stays silent, leaving the pair's live region to announce the Check once", () => {
    const html = renderToStaticMarkup(<CheckStamp />);

    expect(html).toContain('aria-hidden="true"');
    expect(html).not.toContain('role="status"');
  });
});
