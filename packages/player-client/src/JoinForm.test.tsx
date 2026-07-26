import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { JoinForm } from "./JoinForm.js";

describe("JoinForm", () => {
  it("prefills the room code input", () => {
    const html = renderToStaticMarkup(
      <JoinForm
        defaultRoomCode="ABCD"
        error={null}
        onSubmit={() => undefined}
      />,
    );
    expect(html).toContain('data-testid="room-code-input"');
    expect(html).toContain('value="ABCD"');
  });

  it("shows a join error when present", () => {
    const html = renderToStaticMarkup(
      <JoinForm
        defaultRoomCode=""
        error="room-not-found"
        onSubmit={() => undefined}
      />,
    );
    expect(html).toContain('data-testid="join-error"');
    expect(html).toContain("room-not-found");
  });

  it("omits the error element when there is none", () => {
    const html = renderToStaticMarkup(
      <JoinForm defaultRoomCode="" error={null} onSubmit={() => undefined} />,
    );
    expect(html).not.toContain('data-testid="join-error"');
  });
});
