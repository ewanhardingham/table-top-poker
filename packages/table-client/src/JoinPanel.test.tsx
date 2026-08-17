import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { JoinPanel } from "./JoinPanel.js";

describe("JoinPanel", () => {
  it("shows the room code, join URL, QR and lobby hint", () => {
    const html = renderToStaticMarkup(
      <JoinPanel
        roomCode="ABCD"
        joinUrl="http://localhost:3000/join/ABCD"
        qrCodeDataUrl="data:image/png;base64,xyz"
        lobbyHint="Waiting for at least two players"
        dismissable={false}
        onDismiss={() => undefined}
      />,
    );

    expect(html).toContain('data-testid="join-panel"');
    expect(html).toContain("ABCD");
    expect(html).toContain("http://localhost:3000/join/ABCD");
    expect(html).toContain('data-testid="join-panel-qr"');
    expect(html).toContain("Waiting for at least two players");
  });

  it("omits the QR image when none is available", () => {
    const html = renderToStaticMarkup(
      <JoinPanel
        roomCode="ABCD"
        joinUrl={null}
        qrCodeDataUrl={null}
        lobbyHint="Waiting for at least two players"
        dismissable={false}
        onDismiss={() => undefined}
      />,
    );

    expect(html).not.toContain('data-testid="join-panel-qr"');
  });

  it("shows a dismiss control only when dismissable", () => {
    const dismissableHtml = renderToStaticMarkup(
      <JoinPanel
        roomCode="ABCD"
        joinUrl="http://localhost:3000/join/ABCD"
        qrCodeDataUrl="data:image/png;base64,xyz"
        lobbyHint="New players are dealt in from the next hand"
        dismissable={true}
        onDismiss={() => undefined}
      />,
    );
    const pinnedHtml = renderToStaticMarkup(
      <JoinPanel
        roomCode="ABCD"
        joinUrl="http://localhost:3000/join/ABCD"
        qrCodeDataUrl="data:image/png;base64,xyz"
        lobbyHint="Waiting for at least two players"
        dismissable={false}
        onDismiss={() => undefined}
      />,
    );

    expect(dismissableHtml).toContain('data-testid="join-panel-dismiss"');
    expect(pinnedHtml).not.toContain('data-testid="join-panel-dismiss"');
  });

  it("renders optional controls below the join card", () => {
    const html = renderToStaticMarkup(
      <JoinPanel
        roomCode="ABCD"
        joinUrl="http://localhost:3000/join/ABCD"
        qrCodeDataUrl="data:image/png;base64,xyz"
        lobbyHint="Waiting for at least two players"
        dismissable={false}
        onDismiss={() => undefined}
        controls={<div data-testid="join-panel-controls">Controls</div>}
      />,
    );

    expect(html).toContain('data-testid="join-panel-controls"');
    expect(html.indexOf('data-testid="join-panel-code"')).toBeLessThan(
      html.indexOf('data-testid="join-panel-controls"'),
    );
  });
});
