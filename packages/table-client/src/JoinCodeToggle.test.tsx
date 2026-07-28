import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { JoinCodeToggle } from "./JoinCodeToggle.js";

describe("JoinCodeToggle", () => {
  it("shows the room code and a Room label when closed", () => {
    const html = renderToStaticMarkup(
      <JoinCodeToggle
        roomCode="ABCD"
        open={false}
        onToggle={() => {
          /* unused in this test */
        }}
      />,
    );

    expect(html).toContain('data-testid="join-code-toggle"');
    expect(html).toContain("ABCD");
    expect(html).toContain("Room");
  });

  it("shows a Hide code label when open", () => {
    const html = renderToStaticMarkup(
      <JoinCodeToggle
        roomCode="ABCD"
        open={true}
        onToggle={() => {
          /* unused in this test */
        }}
      />,
    );

    expect(html).toContain("Hide code");
  });
});
