import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { JoinForm } from "./JoinForm.js";

describe("JoinForm", () => {
  it("prefills the code boxes from the default room code", () => {
    const html = renderToStaticMarkup(
      <JoinForm
        defaultRoomCode="ABCD"
        error={null}
        onSubmit={() => undefined}
      />,
    );
    expect(html).toContain('data-testid="join-code-box-0"');
    expect(html).toContain(">A<");
    expect(html).toContain(">B<");
    expect(html).toContain(">C<");
    expect(html).toContain(">D<");
  });

  it("disables the join button until four characters are entered", () => {
    const html = renderToStaticMarkup(
      <JoinForm defaultRoomCode="AB" error={null} onSubmit={() => undefined} />,
    );
    expect(html).toContain("Enter 4 letters");
    expect(html).toMatch(/data-testid="join-room-button"[^>]*disabled/);
  });

  it("enables the join button once four characters are entered", () => {
    const html = renderToStaticMarkup(
      <JoinForm
        defaultRoomCode="ABCD"
        error={null}
        onSubmit={() => undefined}
      />,
    );
    expect(html).toContain("Join room");
    expect(html).not.toMatch(/data-testid="join-room-button"[^>]*disabled/);
  });

  it("renders a key for every character in the room-code alphabet", () => {
    const html = renderToStaticMarkup(
      <JoinForm defaultRoomCode="" error={null} onSubmit={() => undefined} />,
    );
    expect(html).toContain('data-testid="join-key-A"');
    expect(html).toContain('data-testid="join-key-9"');
    expect(html).toContain('data-testid="join-key-backspace"');
  });

  it("shows a friendly message for a known join error", () => {
    const html = renderToStaticMarkup(
      <JoinForm
        defaultRoomCode=""
        error="room-not-found"
        onSubmit={() => undefined}
      />,
    );
    expect(html).toContain('data-testid="join-error"');
    expect(html).toContain("check the table screen");
  });

  it("omits the error element when there is none", () => {
    const html = renderToStaticMarkup(
      <JoinForm defaultRoomCode="" error={null} onSubmit={() => undefined} />,
    );
    expect(html).not.toContain('data-testid="join-error"');
  });
});
