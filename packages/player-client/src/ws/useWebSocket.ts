import type {
  ClientCommand,
  PlayerView,
  SeatMove,
  ServerMessage,
} from "@table-top-poker/protocol";
import {
  applyRoomSoundSettings,
  onHandUpdate,
} from "@table-top-poker/ui-shared";
import { useCallback, useEffect, useRef } from "react";
import { usePlayerStore } from "../store/store.js";
import { getWebSocketUrl } from "./getWebSocketUrl.js";

export interface SeatConnectionParams {
  readonly roomCode: string;
  readonly seatId: number;
  readonly token: string;
}

export interface UseWebSocketOptions {
  readonly onRejected?: () => void;
  readonly onRoomEnded?: () => void;
  readonly onEvicted?: () => void;
  readonly onSeatMoved?: (move: SeatMove) => void;
}

export interface SeatSocket {
  readonly send: (command: ClientCommand) => void;
}

interface ActiveConnection {
  readonly roomCode: string;
  readonly token: string;
  seatId: number;
}

const RETRY_DELAY_MS = 1500;

export function useWebSocket(
  params: SeatConnectionParams | null,
  options: UseWebSocketOptions = {},
): SeatSocket {
  const setConnectionStatus = usePlayerStore(
    (state) => state.setConnectionStatus,
  );
  const resetConnection = usePlayerStore((state) => state.resetConnection);
  const setRoomView = usePlayerStore((state) => state.setRoomView);
  const setSeat = usePlayerStore((state) => state.setSeat);
  const moveSeat = usePlayerStore((state) => state.moveSeat);
  const setHandView = usePlayerStore((state) => state.setHandView);
  const viewSnapshotReceived = usePlayerStore(
    (state) => state.viewSnapshotReceived,
  );
  const commandRejected = usePlayerStore((state) => state.commandRejected);
  const socketRef = useRef<WebSocket | null>(null);
  const optionsRef = useRef(options);
  optionsRef.current = options;

  const roomCode = params?.roomCode ?? null;
  const token = params?.token ?? null;
  const seatId = params?.seatId;
  const connectionRef = useRef<ActiveConnection | null>(null);
  if (roomCode === null || token === null || seatId === undefined) {
    connectionRef.current = null;
  } else if (
    connectionRef.current?.roomCode !== roomCode ||
    connectionRef.current.token !== token
  ) {
    connectionRef.current = { roomCode, token, seatId };
  }

  useEffect(() => {
    const connection = connectionRef.current;
    if (connection === null) {
      resetConnection();
      return;
    }
    const activeConnection = connection;

    let active = true;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;

    function connect(): void {
      if (!active) return;
      setConnectionStatus("connecting");
      let openedOnce = false;
      const socket = new WebSocket(
        getWebSocketUrl(window.location, {
          room: activeConnection.roomCode,
          seat: String(activeConnection.seatId),
          token: activeConnection.token,
        }),
      );
      socketRef.current = socket;

      socket.addEventListener("open", () => {
        openedOnce = true;
        if (active) setConnectionStatus("connected");
      });
      socket.addEventListener("close", () => {
        if (!active) return;
        setConnectionStatus("disconnected");
        if (!openedOnce) {
          optionsRef.current.onRejected?.();
          return;
        }
        retryTimer = setTimeout(connect, RETRY_DELAY_MS);
      });
      socket.addEventListener("message", (event: MessageEvent<string>) => {
        if (!active) return;
        const message: ServerMessage = JSON.parse(event.data) as ServerMessage;
        switch (message.type) {
          case "room-view":
            setRoomView(message.view);
            applyRoomSoundSettings(message.view.soundSettings);
            {
              const seat = message.view.seats.find(
                (candidate) => candidate.id === activeConnection.seatId,
              );
              if (seat?.claimed) {
                setSeat({
                  seatId: seat.id,
                  displayName: seat.displayName ?? null,
                  sittingOut: seat.sittingOut,
                  sittingOutReason: seat.sittingOutReason,
                });
              }
            }
            break;
          case "hand-update":
            setHandView(message.view as PlayerView);
            viewSnapshotReceived();
            onHandUpdate({
              surface: "player",
              event: message.event,
              view: message.view,
              seatId: activeConnection.seatId,
            });
            break;
          case "view-snapshot":
            setHandView(message.view as PlayerView);
            viewSnapshotReceived();
            break;
          case "command-rejected":
            commandRejected(message.reason);
            break;
          case "seat-moved":
            activeConnection.seatId = message.to;
            moveSeat(message.to);
            optionsRef.current.onSeatMoved?.({
              from: message.from,
              to: message.to,
            });
            break;
          case "room-ended":
            optionsRef.current.onRoomEnded?.();
            break;
          case "player-evicted":
            active = false;
            optionsRef.current.onEvicted?.();
            break;
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
    token,
    setConnectionStatus,
    resetConnection,
    setRoomView,
    setSeat,
    moveSeat,
    setHandView,
    viewSnapshotReceived,
    commandRejected,
  ]);

  const send = useCallback((command: ClientCommand) => {
    if (socketRef.current?.readyState !== WebSocket.OPEN) return;
    socketRef.current.send(JSON.stringify(command));
  }, []);

  return { send };
}
