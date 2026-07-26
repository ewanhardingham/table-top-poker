import React from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import App from "./App.js";
import { getWebSocketUrl } from "./hooks/useWebSocket.js";
import { usePlayerStore } from "./store/index.js";

describe("player-client", () => {
  it("derives WebSocket URL scheme correctly from location.protocol", () => {
    const mockHttpsLocation = {
      protocol: "https:",
      host: "player.local:8080",
    } as Location;
    expect(getWebSocketUrl("/ws", mockHttpsLocation)).toBe(
      "wss://player.local:8080/ws",
    );

    const mockHttpLocation = {
      protocol: "http:",
      host: "localhost:3000",
    } as Location;
    expect(getWebSocketUrl("/ws", mockHttpLocation)).toBe(
      "ws://localhost:3000/ws",
    );
  });

  it("updates Zustand connection slice and player slice independently", () => {
    const store = usePlayerStore.getState();
    expect(store.connectionStatus).toBe("disconnected");
    expect(store.seatId).toBeNull();

    store.setConnectionStatus("connected");
    expect(usePlayerStore.getState().connectionStatus).toBe("connected");
    expect(usePlayerStore.getState().seatId).toBeNull();

    store.setSeatId(2);
    expect(usePlayerStore.getState().seatId).toBe(2);
    expect(usePlayerStore.getState().connectionStatus).toBe("connected");
  });

  it("renders player-client app shell, hole cards and action buttons", () => {
    const html = renderToString(React.createElement(App));
    expect(html).toContain('data-testid="player-client-shell"');
    expect(html).toContain('data-testid="connection-status"');
    expect(html).toContain('data-testid="hole-cards"');
    expect(html).toContain('data-testid="action-buttons"');
    expect(html).toContain("Table Top Poker — Player");
  });
});
