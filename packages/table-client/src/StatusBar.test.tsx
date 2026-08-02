import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { StatusBar } from "./StatusBar.js";

describe("StatusBar", () => {
  it("hides the connection badge before a room exists", () => {
    const html = renderToStaticMarkup(
      <StatusBar
        roomCode={null}
        connectionStatus="disconnected"
        showRoomCode={false}
        joinOpen={false}
        onToggleJoin={() => {
          /* unused in this test */
        }}
      />,
    );
    expect(html).not.toContain('data-testid="connection-status"');
    expect(html).not.toContain('data-testid="join-code-toggle"');
  });

  it("puts the room code on the left and connection badge on the right", () => {
    const html = renderToStaticMarkup(
      <StatusBar
        roomCode="ABCD"
        connectionStatus="connected"
        showRoomCode={true}
        joinOpen={false}
        onToggleJoin={() => {
          /* unused in this test */
        }}
      />,
    );
    expect(html).toContain('data-testid="connection-status"');
    expect(html).toContain("connected");
    expect(html).toContain('data-testid="join-code-toggle"');
    expect(html).toContain("ABCD");

    const headerMatch = /<header[^>]*>[\s\S]*<\/header>/.exec(html);
    expect(headerMatch).not.toBeNull();
    expect(headerMatch?.[0]).toContain('data-testid="join-code-toggle"');
    expect(headerMatch?.[0]).toContain('data-testid="connection-status"');
    expect(headerMatch?.[0]).toContain("padding:16px 22px");
    expect(
      headerMatch?.[0].indexOf('data-testid="join-code-toggle"'),
    ).toBeLessThan(
      headerMatch?.[0].indexOf('data-testid="connection-status"') ?? -1,
    );
  });

  it("keeps the connection badge while hiding the room code before the hand starts", () => {
    const html = renderToStaticMarkup(
      <StatusBar
        roomCode="ABCD"
        connectionStatus="connected"
        showRoomCode={false}
        joinOpen={false}
        onToggleJoin={() => {
          /* unused in this test */
        }}
      />,
    );
    expect(html).not.toContain('data-testid="join-code-toggle"');
    expect(html).toContain('data-testid="connection-status"');
    expect(html).toContain("margin-left:auto");
  });
});
