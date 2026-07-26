import React from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import App from "./App.js";
import { getWebSocketUrl } from "./hooks/useWebSocket.js";
import { useTableStore } from "./store/index.js";

describe("table-client", () => {
  it("derives WebSocket URL scheme correctly from location.protocol", () => {
    const mockHttpsLocation = {
      protocol: "https:",
      host: "poker.local:8080",
    } as Location;
    expect(getWebSocketUrl("/ws", mockHttpsLocation)).toBe(
      "wss://poker.local:8080/ws",
    );

    const mockHttpLocation = {
      protocol: "http:",
      host: "localhost:3000",
    } as Location;
    expect(getWebSocketUrl("/ws", mockHttpLocation)).toBe(
      "ws://localhost:3000/ws",
    );
  });

  it("updates Zustand connection slice and table slice independently", () => {
    const store = useTableStore.getState();
    expect(store.connectionStatus).toBe("disconnected");
    expect(store.roomCode).toBeNull();

    store.setConnectionStatus("connected");
    expect(useTableStore.getState().connectionStatus).toBe("connected");
    expect(useTableStore.getState().roomCode).toBeNull();

    store.setRoomCode("TEST");
    expect(useTableStore.getState().roomCode).toBe("TEST");
    expect(useTableStore.getState().connectionStatus).toBe("connected");
  });

  it("renders table-client app shell and placeholder components", () => {
    const html = renderToString(React.createElement(App));
    expect(html).toContain('data-testid="table-client-shell"');
    expect(html).toContain('data-testid="connection-status"');
    expect(html).toContain('data-testid="community-cards"');
    expect(html).toContain("Table Top Poker — Table Device");
  });
});
