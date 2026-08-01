import type { ClientCommand, ServerMessage } from "@table-top-poker/protocol";
import { useCallback, useEffect, useRef } from "react";
import { useTableStore } from "../store/store.js";
import { getWebSocketUrl } from "./getWebSocketUrl.js";

export interface UseWebSocketOptions {
  /** The room ended — manual "End session" or the table's own grace window elapsing. */
  readonly onRoomEnded?: () => void;
}

export interface TableSocket {
  /** No-ops silently while disconnected — buttons are gated on connection state upstream. */
  readonly send: (command: ClientCommand) => void;
}

const RETRY_DELAY_MS = 1500;

/**
 * Opens a room-scoped WebSocket connection once a room exists and reflects
 * its lifecycle into the connection slice. Every `room-view` push replaces
 * the seat slice; every `hand-update`/`view-snapshot` replaces the hand
 * slice with the fresh `view(state, 'table')` the server just computed —
 * the view is source of truth (Phase 1 spec #130 §6), never rebuilt from
 * the raw event locally. `command-rejected` renders nothing on the table
 * device by design (§9 — only the rejecting player ever sees a rejection).
 *
 * A dropped socket retries after a fixed delay — the table device is
 * expected to keep trying for the whole 60s grace window (§7); the server,
 * not this hook, is what ends the room if it never reconnects in time.
 */
export function useWebSocket(
  roomCode: string | null,
  options: UseWebSocketOptions = {},
): TableSocket {
  const setConnectionStatus = useTableStore(
    (state) => state.setConnectionStatus,
  );
  const setRoomView = useTableStore((state) => state.setRoomView);
  const setHandView = useTableStore((state) => state.setHandView);
  const socketRef = useRef<WebSocket | null>(null);
  const optionsRef = useRef(options);
  optionsRef.current = options;

  useEffect(() => {
    if (roomCode === null) {
      setConnectionStatus("disconnected");
      return;
    }

    const code = roomCode;
    let active = true;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;

    function connect(): void {
      if (!active) return;
      setConnectionStatus("connecting");
      const socket = new WebSocket(
        getWebSocketUrl(window.location, { room: code, role: "table" }),
      );
      socketRef.current = socket;

      socket.addEventListener("open", () => {
        if (active) setConnectionStatus("connected");
      });
      socket.addEventListener("close", () => {
        if (!active) return;
        setConnectionStatus("disconnected");
        retryTimer = setTimeout(connect, RETRY_DELAY_MS);
      });
      socket.addEventListener("message", (event: MessageEvent<string>) => {
        if (!active) return;
        const message: ServerMessage = JSON.parse(event.data) as ServerMessage;
        if (message.type === "room-view") {
          setRoomView(message.view);
        } else if (message.type === "hand-update") {
          // The server only ever sends a table-role socket a `view(state, 'table')`.
          setHandView(message.view);
        } else if (message.type === "view-snapshot") {
          setHandView(message.view);
        } else if (message.type === "room-ended") {
          optionsRef.current.onRoomEnded?.();
        }
      });
    }

    connect();

    return () => {
      active = false;
      if (retryTimer !== undefined) clearTimeout(retryTimer);
      socketRef.current?.close();
      socketRef.current = null;
    };
  }, [roomCode, setConnectionStatus, setRoomView, setHandView]);

  const send = useCallback((command: ClientCommand) => {
    socketRef.current?.send(JSON.stringify(command));
  }, []);

  return { send };
}
