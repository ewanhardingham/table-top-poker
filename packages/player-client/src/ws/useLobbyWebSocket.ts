import type { ServerMessage } from "@table-top-poker/protocol";
import { useEffect, useRef } from "react";
import { usePlayerStore } from "../store/store.js";
import { getWebSocketUrl } from "./getWebSocketUrl.js";

export interface LobbyWebSocketOptions {
  readonly onRoomEnded?: () => void;
}

const RETRY_DELAY_MS = 1500;
const MAX_REFUSED_CONNECTS = 3;

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
