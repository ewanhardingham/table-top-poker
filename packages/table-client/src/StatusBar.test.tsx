import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { StatusBar } from "./StatusBar.js";

const noop = () => undefined;

describe("StatusBar", () => {
  it("hides the connection badge before a room exists", () => {
    const html = renderToStaticMarkup(
      <StatusBar
        roomCode={null}
        connectionStatus="disconnected"
        showRoomCode={false}
        onOpenJoin={noop}
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
        onOpenJoin={noop}
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

  it("renders leading content at the left end, ahead of the room code", () => {
    const html = renderToStaticMarkup(
      <StatusBar
        roomCode="ABCD"
        connectionStatus="connected"
        showRoomCode={true}
        onOpenJoin={noop}
        leading={<span data-testid="leading">Hand 3</span>}
      />,
    );
    expect(html).toContain("Hand 3");
    expect(html.indexOf('data-testid="leading"')).toBeLessThan(
      html.indexOf('data-testid="join-code-toggle"'),
    );
  });

  it("keeps the connection badge while hiding the room code before the hand starts", () => {
    const html = renderToStaticMarkup(
      <StatusBar
        roomCode="ABCD"
        connectionStatus="connected"
        showRoomCode={false}
        onOpenJoin={noop}
      />,
    );
    expect(html).not.toContain('data-testid="join-code-toggle"');
    expect(html).toContain('data-testid="connection-status"');
    expect(html).toContain("margin-left:auto");
  });

  it("yields the connection label before the room pill gives ground", () => {
    const html = renderToStaticMarkup(
      <StatusBar
        roomCode="ABCD"
        connectionStatus="disconnected"
        showRoomCode={true}
        onOpenJoin={noop}
      />,
    );

    const badge =
      /<span[^>]*data-testid="connection-status"[^>]*>/.exec(html)?.[0] ?? "";
    expect(badge).toContain("flex-shrink:100");
    expect(badge).toContain("overflow:hidden");
    expect(badge).not.toContain("min-width:0");

    const label =
      /<span class="connection-status-label"[^>]*>/.exec(html)?.[0] ?? "";
    expect(label).toContain("min-width:0");
    expect(label).toContain("text-overflow:ellipsis");
  });
});
