import { positionMarkerColor } from "@table-top-poker/ui-shared";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PositionBadge } from "./PositionBadge.js";

describe("PositionBadge", () => {
  it.each([
    ["button", "D"],
    ["small-blind", "SB"],
    ["big-blind", "BB"],
  ] as const)("prints the table's own label for %s", (marker, label) => {
    const html = renderToStaticMarkup(<PositionBadge marker={marker} />);
    expect(html).toContain(`data-marker="${marker}"`);
    expect(html).toContain(`>${label}</span>`);
  });

  it("takes its colour from the shared token, not a local copy", () => {
    const html = renderToStaticMarkup(<PositionBadge marker="small-blind" />);
    expect(html).toContain(positionMarkerColor["small-blind"]);
  });

  it("says what the letter means rather than leaving a screen reader to spell it", () => {
    const html = renderToStaticMarkup(<PositionBadge marker="button" />);
    expect(html).toContain('aria-label="You are on the dealer button"');
    // The visible label is decoration once the disc is labelled.
    expect(html).toContain('aria-hidden="true"');
  });

  it("keeps the disc round: diameter and label size sit on separate elements", () => {
    const html = renderToStaticMarkup(<PositionBadge marker="big-blind" />);
    const outer = /width:2\.1em;height:2\.1em/.exec(html);
    expect(outer).not.toBeNull();
    // A font-size on that same element would shrink the true diameter to
    // 2.1 x 0.8em — the bug #160 hit on the table.
    expect(html).toMatch(/width:2\.1em;height:2\.1em(?![^>]*font-size)/);
  });

  it("dims when the banner is no longer reporting live state", () => {
    const live = renderToStaticMarkup(<PositionBadge marker="button" />);
    const offline = renderToStaticMarkup(
      <PositionBadge marker="button" dimmed />,
    );
    expect(live).toContain("opacity:1");
    expect(offline).toContain("opacity:0.55");
  });
});
