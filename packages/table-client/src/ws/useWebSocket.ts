import type { ClientCommand, ServerMessage } from "@table-top-poker/protocol";
import {
  applyRoomSoundSettings,
  onHandUpdate,
} from "@table-top-poker/ui-shared";
import { useCallback, useEffect, useRef } from "react";
import { useTableStore } from "../store/store.js";
import { getWebSocketUrl } from "./getWebSocketUrl.js";

export interface UseWebSocketOptions {
  readonly onRoomEnded?: () => void;
}

export interface TableSocket {
  readonly send: (command: ClientCommand) => void;
}

const RETRY_DELAY_MS = 1500;

export function useWebSocket(
  roomCode: string | null,
  options: UseWebSocketOptions = {},
): TableSocket {
  const setConnectionStatus = useTableStore(
    (state) => state.setConnectionStatus,
  );
  const setRoomView = useTableStore((state) => state.setRoomView);
  const setHandView = useTableStore((state) => state.setHandView);
  const setRecordingStopped = useTableStore(
    (state) => state.setRecordingStopped,
  );
  const setHandList = useTableStore((state) => state.setHandList);
  const addHandSummary = useTableStore((state) => state.addHandSummary);
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
          applyRoomSoundSettings(message.view.soundSettings);
        } else if (message.type === "hand-update") {
          setHandView(message.view);
          onHandUpdate({
            surface: "table",
            event: message.event,
            view: message.view,
          });
        } else if (message.type === "view-snapshot") {
          setHandView(message.view);
        } else if (message.type === "hand-list") {
          setHandList(message.summaries);
        } else if (message.type === "hand-summary") {
          addHandSummary(message.summary);
        } else if (message.type === "room-ended") {
          optionsRef.current.onRoomEnded?.();
        } else if (message.type === "recording-stopped") {
          setRecordingStopped();
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
  }, [
    roomCode,
    setConnectionStatus,
    setRoomView,
    setHandView,
    setRecordingStopped,
    setHandList,
    addHandSummary,
  ]);

  const send = useCallback((command: ClientCommand) => {
    socketRef.current?.send(JSON.stringify(command));
  }, []);

  return { send };
}
