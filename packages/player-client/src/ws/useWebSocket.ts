import type { PlayerView, ServerMessage } from "@table-top-poker/protocol";
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
 * replaces the seat list; every `hand-update` replaces the hand slice with
 * the fresh `view(state, seatId)` the server just computed for this seat —
 * the view is source of truth (docs/phase-1-spec.md §6), never rebuilt from
 * the raw event locally. No action-intent module yet (fold/check/call/raise
 * over this socket) — that's ticket 30. No reconnection logic yet — that's
 * ticket 33.
 */
export function useWebSocket(params: SeatConnectionParams | null): void {
  const setConnectionStatus = usePlayerStore(
    (state) => state.setConnectionStatus,
  );
  const setRoomView = usePlayerStore((state) => state.setRoomView);
  const setHandUpdate = usePlayerStore((state) => state.setHandUpdate);

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
      if (message.type === "room-view") {
        setRoomView(message.view);
      } else if (message.type === "hand-update") {
        // The server only ever sends a seat's socket its own `view(state, seatId)`.
        setHandUpdate(message.event, message.view as PlayerView);
      }
    });

    return () => {
      active = false;
      socket.close();
    };
  }, [params, setConnectionStatus, setRoomView, setHandUpdate]);
}
