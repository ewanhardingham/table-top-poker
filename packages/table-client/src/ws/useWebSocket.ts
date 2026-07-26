import type { ClientCommand, ServerMessage } from "@table-top-poker/protocol";
import { useCallback, useEffect, useRef } from "react";
import { useTableStore } from "../store/store.js";
import { getWebSocketUrl } from "./getWebSocketUrl.js";

export interface TableSocket {
  /** No-ops silently while disconnected — buttons are gated on connection state upstream. */
  readonly send: (command: ClientCommand) => void;
}

/**
 * Opens a room-scoped WebSocket connection once a room exists and reflects
 * its lifecycle into the connection slice. Every `room-view` push replaces
 * the seat slice; every `hand-update` replaces the hand slice with the
 * fresh `view(state, 'table')` the server just computed — the view is
 * source of truth (docs/phase-1-spec.md §6), never rebuilt from the raw
 * event locally. `command-rejected` renders nothing on the table device by
 * design (§9 — only the rejecting player ever sees a rejection). No
 * reconnection logic yet — that's ticket 33.
 */
export function useWebSocket(roomCode: string | null): TableSocket {
  const setConnectionStatus = useTableStore(
    (state) => state.setConnectionStatus,
  );
  const setRoomView = useTableStore((state) => state.setRoomView);
  const setHandView = useTableStore((state) => state.setHandView);
  const socketRef = useRef<WebSocket | null>(null);

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
        // The server only ever sends a table-role socket a `view(state, 'table')`.
        setHandView(message.view);
      }
    });

    return () => {
      active = false;
      socketRef.current = null;
      socket.close();
    };
  }, [roomCode, setConnectionStatus, setRoomView, setHandView]);

  const send = useCallback((command: ClientCommand) => {
    socketRef.current?.send(JSON.stringify(command));
  }, []);

  return { send };
}
