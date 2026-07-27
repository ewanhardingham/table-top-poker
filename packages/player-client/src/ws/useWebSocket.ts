import type {
  ClientCommand,
  PlayerView,
  ServerMessage,
} from "@table-top-poker/protocol";
import { useCallback, useEffect, useRef } from "react";
import { usePlayerStore } from "../store/store.js";
import { getWebSocketUrl } from "./getWebSocketUrl.js";

export interface SeatConnectionParams {
  readonly roomCode: string;
  readonly seatId: number;
  readonly token: string;
}

export interface SeatSocket {
  /** No-ops silently while disconnected — buttons are gated on connection state upstream. */
  readonly send: (command: ClientCommand) => void;
}

/**
 * Opens a seat-scoped WebSocket connection once a seat is claimed and
 * reflects its lifecycle into the connection slice. Every `room-view` push
 * replaces the seat list; every `hand-update` replaces the hand slice with
 * the fresh `view(state, seatId)` the server just computed for this seat —
 * the view is source of truth (docs/phase-1-spec.md §6), never rebuilt from
 * the raw event locally. That same snapshot also clears any pending/
 * rejected action, since the view is what "next legal action or next view
 * snapshot" (§9) resolves against. `command-rejected` is delivered to the
 * sender only, so it's always this player's own action being rejected — it
 * feeds the action slice's rejection, never a broadcast. No reconnection
 * logic yet — that's ticket 33.
 */
export function useWebSocket(params: SeatConnectionParams | null): SeatSocket {
  const setConnectionStatus = usePlayerStore(
    (state) => state.setConnectionStatus,
  );
  const setRoomView = usePlayerStore((state) => state.setRoomView);
  const setHandView = usePlayerStore((state) => state.setHandView);
  const viewSnapshotReceived = usePlayerStore(
    (state) => state.viewSnapshotReceived,
  );
  const commandRejected = usePlayerStore((state) => state.commandRejected);
  const socketRef = useRef<WebSocket | null>(null);

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
    socketRef.current = socket;

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
        setHandView(message.view as PlayerView);
        viewSnapshotReceived();
      } else {
        commandRejected(message.reason);
      }
    });

    return () => {
      active = false;
      socketRef.current = null;
      socket.close();
    };
  }, [
    params,
    setConnectionStatus,
    setRoomView,
    setHandView,
    viewSnapshotReceived,
    commandRejected,
  ]);

  const send = useCallback((command: ClientCommand) => {
    socketRef.current?.send(JSON.stringify(command));
  }, []);

  return { send };
}
