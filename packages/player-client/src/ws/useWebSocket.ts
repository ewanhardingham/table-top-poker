import type { ServerMessage } from "@table-top-poker/protocol";
import { useEffect } from "react";
import { usePlayerStore } from "../store/store.js";
import { getWebSocketUrl } from "./getWebSocketUrl.js";

export interface SeatConnectionParams {
  readonly roomCode: string;
  readonly seatId: number;
  readonly token: string;
}

/**
 * Opens a seat-scoped WebSocket connection once a seat is claimed and
 * reflects its lifecycle into the connection slice. Every `room-view` push
 * replaces the seat list. No reconnection logic yet — that's ticket 33.
 */
export function useWebSocket(params: SeatConnectionParams | null): void {
  const setConnectionStatus = usePlayerStore(
    (state) => state.setConnectionStatus,
  );
  const setRoomView = usePlayerStore((state) => state.setRoomView);

  useEffect(() => {
    if (params === null) {
      setConnectionStatus("disconnected");
      return;
    }

    let active = true;
    setConnectionStatus("connecting");
    const socket = new WebSocket(
      getWebSocketUrl(window.location, {
        room: params.roomCode,
        seat: String(params.seatId),
        token: params.token,
      }),
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
  }, [params, setConnectionStatus, setRoomView]);
}
