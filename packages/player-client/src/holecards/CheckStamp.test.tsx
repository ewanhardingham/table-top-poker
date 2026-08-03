import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { CheckStamp } from "./CheckStamp.js";

/**
 * The stamp is presentation, so what is worth pinning is the contract the
 * surrounding surface leans on rather than the markup it happens to emit: it
 * must not take a gesture off the cards, and it must not speak, because
 * `HoleCardPair`'s live region already announces the same Check.
 */
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
