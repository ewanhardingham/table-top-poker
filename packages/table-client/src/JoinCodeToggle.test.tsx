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
});
