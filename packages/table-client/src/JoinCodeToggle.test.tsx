import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { JoinCodeToggle } from "./JoinCodeToggle.js";

const noop = () => {
  /* unused in these tests */
};

describe("JoinCodeToggle", () => {
  it("shows the room code and a Room label", () => {
    const html = renderToStaticMarkup(
      <JoinCodeToggle roomCode="ABCD" onOpen={noop} />,
    );

    expect(html).toContain('data-testid="join-code-toggle"');
    expect(html).toContain("ABCD");
    expect(html).toContain("Room");
  });

  it("sits in the status-bar flow rather than positioning itself", () => {
    const html = renderToStaticMarkup(
      <JoinCodeToggle roomCode="ABCD" onOpen={noop} />,
    );

    expect(html).not.toContain("position:absolute");
  });

  /*
   * Shrinkable rather than fixed, so a narrow bar squeezes this pill instead
   * of pushing the badge beside it off the edge (ADR-0006). The label gives
   * way; the code is what a player has to read off the screen to join, so it
   * is fixed.
   */
  it("gives up its label before the room code", () => {
    const html = renderToStaticMarkup(
      <JoinCodeToggle roomCode="ABCD" onOpen={noop} />,
    );

    expect(html).toContain("flex:0 1 auto");
    expect(html).not.toContain("flex:none;min-width:0");

    const label = /<span style="[^"]*">Room<\/span>/.exec(html)?.[0] ?? "";
    expect(label).toContain("flex-shrink:100");
    expect(label).toContain("overflow:hidden");

    const code = /<span style="[^"]*">ABCD<\/span>/.exec(html)?.[0] ?? "";
    expect(code).toContain("flex:none");
  });
});
