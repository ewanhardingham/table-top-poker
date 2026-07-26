import { useEffect, useRef } from "react";
import { usePlayerStore } from "../store/index.js";

export function getWebSocketUrl(path = "/ws", locationObj?: Location): string {
  const loc =
    locationObj ??
    (typeof window !== "undefined" ? window.location : undefined);
  if (!loc) return "ws://localhost:3000/ws";
  const protocol = loc.protocol === "https:" ? "wss:" : "ws:";
  return `${protocol}//${loc.host}${path}`;
}

export function useWebSocket(urlOverride?: string): void {
  const setConnectionStatus = usePlayerStore(
    (state) => state.setConnectionStatus,
  );
  const socketRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    const url = urlOverride ?? getWebSocketUrl();
    setConnectionStatus("connecting");

    try {
      const socket = new WebSocket(url);
      socketRef.current = socket;

      socket.onopen = () => {
        setConnectionStatus("connected");
      };

      socket.onclose = () => {
        setConnectionStatus("disconnected");
      };

      socket.onerror = () => {
        setConnectionStatus("disconnected");
      };
    } catch {
      setConnectionStatus("disconnected");
    }

    return () => {
      if (socketRef.current) {
        socketRef.current.close();
        socketRef.current = null;
      }
    };
  }, [setConnectionStatus, urlOverride]);
}
