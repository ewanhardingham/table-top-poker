import type { ServerMessage } from "@table-top-poker/protocol";
import { useEffect, useRef } from "react";
import { usePlayerStore } from "../store/store.js";
import { getWebSocketUrl } from "./getWebSocketUrl.js";

export interface LobbyWebSocketOptions {
  readonly onRoomEnded?: () => void;
}

const RETRY_DELAY_MS = 1500;
/**
 * A lobby socket has no token that can go stale, so a refused upgrade means
 * either the room is gone or the server is briefly unreachable. Only after
 * this many consecutive refusals is the room declared gone — a single failed
 * connect is far more often a restart or a dropped link than an ended room.
 */
const MAX_REFUSED_CONNECTS = 3;

/**
 * Keeps the unclaimed seat picker subscribed to room-level changes. A lobby
 * socket receives room views only; it has no seat identity and cannot issue
 * table or player commands.
 *
 * Unlike a seat socket, this one retries a close that never opened: there is
 * no equivalent of a stale seat token to spin against, and a room that really
 * has ended says so on the wire (`room-ended`) before closing.
 */
export function useLobbyWebSocket(
  roomCode: string | null,
  options: LobbyWebSocketOptions = {},
): void {
  const setRoomView = usePlayerStore((state) => state.setRoomView);
  const optionsRef = useRef(options);
  optionsRef.current = options;

  useEffect(() => {
    if (roomCode === null) return;

    const code = roomCode;
    let active = true;
    let ended = false;
    let refusedConnects = 0;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    let socketRef: WebSocket | null = null;

    function connect(): void {
      if (!active) return;

      let openedOnce = false;
      const socket = new WebSocket(
        getWebSocketUrl(window.location, { room: code, role: "lobby" }),
      );
      socketRef = socket;

      socket.addEventListener("open", () => {
        openedOnce = true;
        refusedConnects = 0;
      });
      socket.addEventListener("close", () => {
        if (!active || ended) return;
        if (!openedOnce) {
          refusedConnects += 1;
          if (refusedConnects >= MAX_REFUSED_CONNECTS) {
            optionsRef.current.onRoomEnded?.();
            return;
          }
        }
        retryTimer = setTimeout(connect, RETRY_DELAY_MS);
      });
      socket.addEventListener("message", (event: MessageEvent<string>) => {
        if (!active) return;
        const message: ServerMessage = JSON.parse(event.data) as ServerMessage;
        if (message.type === "room-view") {
          setRoomView(message.view);
        } else if (message.type === "room-ended") {
          // The room said so itself — the close that follows is expected and
          // must not restart the retry loop.
          ended = true;
          optionsRef.current.onRoomEnded?.();
        }
      });
    }

    connect();

    return () => {
      active = false;
      if (retryTimer !== undefined) clearTimeout(retryTimer);
      socketRef?.close();
      socketRef = null;
    };
  }, [roomCode, setRoomView]);
}
