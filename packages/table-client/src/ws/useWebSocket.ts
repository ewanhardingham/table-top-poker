import type { ServerMessage } from "@table-top-poker/protocol";
import { useEffect } from "react";
import { useTableStore } from "../store/store.js";
import { getWebSocketUrl } from "./getWebSocketUrl.js";

/**
 * Opens a room-scoped WebSocket connection once a room exists and reflects
 * its lifecycle into the connection slice. Every `room-view` push replaces
 * the seat slice. No reconnection logic yet — that's ticket 33.
 */
export function useWebSocket(roomCode: string | null): void {
  const setConnectionStatus = useTableStore(
    (state) => state.setConnectionStatus,
  );
  const setRoomView = useTableStore((state) => state.setRoomView);

  useEffect(() => {
    if (roomCode === null) {
      setConnectionStatus("disconnected");
      return;
    }

    let active = true;
    setConnectionStatus("connecting");
    const socket = new WebSocket(
      getWebSocketUrl(window.location, { room: roomCode, role: "table" }),
    );

    socket.addEventListener("open", () => {
      if (active) setConnectionStatus("connected");
    });
    socket.addEventListener("close", () => {
      if (active) setConnectionStatus("disconnected");
    });
    socket.addEventListener("message", (event: MessageEvent<string>) => {
      if (!active) return;
      const message: ServerMessage = JSON.parse(event.data) as ServerMessage;
      setRoomView(message.view);
    });

    return () => {
      active = false;
      socket.close();
    };
  }, [roomCode, setConnectionStatus, setRoomView]);
}
