import { useEffect } from "react";
import { usePlayerStore } from "../store/store.js";
import { getWebSocketUrl } from "./getWebSocketUrl.js";

/**
 * Opens a WebSocket connection on mount and reflects its lifecycle into the
 * connection slice. No reconnection logic yet — that's ticket 15.
 */
export function useWebSocket(): void {
  const setConnectionStatus = usePlayerStore(
    (state) => state.setConnectionStatus,
  );

  useEffect(() => {
    let active = true;
    setConnectionStatus("connecting");
    const socket = new WebSocket(getWebSocketUrl(window.location));

    socket.addEventListener("open", () => {
      if (active) setConnectionStatus("connected");
    });
    socket.addEventListener("close", () => {
      if (active) setConnectionStatus("disconnected");
    });

    return () => {
      active = false;
      socket.close();
    };
  }, [setConnectionStatus]);
}
