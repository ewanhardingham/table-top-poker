import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { RoomPanel } from "./RoomPanel.js";

describe("RoomPanel", () => {
  it("shows the room code, QR and live seat list", () => {
    const html = renderToStaticMarkup(
      <RoomPanel
        roomCode="ABCD"
        joinUrl="http://localhost:3000/join/ABCD"
        qrCodeDataUrl="data:image/png;base64,xyz"
        seats={[
          { id: 0, claimed: true, sittingOut: false, disconnected: false },
          { id: 1, claimed: true, sittingOut: true, disconnected: false },
          { id: 2, claimed: false, sittingOut: false, disconnected: false },
        ]}
        onEndSession={() => {
          /* unused in this test */
        }}
      />,
    );

    expect(html).toContain('data-testid="room-panel"');
    expect(html).toContain("ABCD");
    expect(html).toContain('data-testid="room-qr"');
    expect(html).toMatch(/data-testid="seat-0"[^>]*data-claimed="true"/);
    expect(html).toMatch(/data-testid="seat-1"[^>]*data-sitting-out="true"/);
    expect(html).toMatch(/data-testid="seat-2"[^>]*data-claimed="false"/);
  });

  it("shows a disconnected badge only for a claimed, presence-dropped seat", () => {
    const html = renderToStaticMarkup(
      <RoomPanel
        roomCode="ABCD"
        joinUrl="http://localhost:3000/join/ABCD"
        qrCodeDataUrl="data:image/png;base64,xyz"
        seats={[
          { id: 0, claimed: true, sittingOut: false, disconnected: true },
          { id: 1, claimed: false, sittingOut: false, disconnected: false },
        ]}
        onEndSession={() => {
          /* unused in this test */
        }}
      />,
    );

    expect(html).toMatch(/data-testid="seat-0"[^>]*data-disconnected="true"/);
    expect(html).toContain('data-testid="seat-0-disconnected"');
  });

  it("omits the QR image when none is available", () => {
    const html = renderToStaticMarkup(
      <RoomPanel
        roomCode="ABCD"
        joinUrl={null}
        qrCodeDataUrl={null}
        seats={[]}
        onEndSession={() => {
          /* unused in this test */
        }}
      />,
    );

    expect(html).not.toContain('data-testid="room-qr"');
  });
});
