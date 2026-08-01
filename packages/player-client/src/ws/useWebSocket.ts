import type {
  ClientCommand,
  PlayerView,
  SeatMove,
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

export interface UseWebSocketOptions {
  /**
   * The socket closed before ever opening — an upgrade-time rejection (a
   * bad or stale seat token), not a network blip. Retrying would spin
   * forever against a seat that's gone, so the caller drops back to the
   * seat picker instead (Phase 1 spec #130 §7 — a cleared token never
   * auto-reclaims a seat).
   */
  readonly onRejected?: () => void;
  /** The room ended — manual "End session" or the table's grace window elapsing. */
  readonly onRoomEnded?: () => void;
  /** The seat was evicted by the table device. */
  readonly onEvicted?: () => void;
  /** The table repacked this player's seat during a seat-count change. */
  readonly onSeatMoved?: (move: SeatMove) => void;
}

export interface SeatSocket {
  /** No-ops silently unless the socket is open — calling `WebSocket.send` before then throws. */
  readonly send: (command: ClientCommand) => void;
}

interface ActiveConnection {
  readonly roomCode: string;
  readonly token: string;
  seatId: number;
}

const RETRY_DELAY_MS = 1500;

/**
 * Opens a seat-scoped WebSocket connection once a seat is claimed and
 * reflects its lifecycle into the connection slice. Every `room-view` push
 * replaces the seat list; every `hand-update`/`view-snapshot` replaces the
 * hand slice with the fresh `view(state, seatId)` the server just computed
 * for this seat — the view is source of truth (Phase 1 spec #130 §6),
 * never rebuilt from the raw event locally. That same snapshot also clears
 * any pending/rejected action, since the view is what "next legal action or
 * next view snapshot" (§9) resolves against. `command-rejected` is
 * delivered to the sender only, so it's always this player's own action
 * being rejected — it feeds the action slice's rejection, never a
 * broadcast.
 *
 * A socket that closes after having opened retries after a fixed delay —
 * a transient drop, not a rejection. One that closes without ever opening
 * is treated as terminal and is not retried; see `onRejected`.
 */
export function useWebSocket(
  params: SeatConnectionParams | null,
  options: UseWebSocketOptions = {},
): SeatSocket {
  const setConnectionStatus = usePlayerStore(
    (state) => state.setConnectionStatus,
  );
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

  // Keep the existing socket open after a seat move. The transport seat is
  // updated for reconnects without making the server briefly mark the player
  // disconnected while the effect restarts.
  // The effect is keyed by room and token; the mutable seat in the connection
  // ref deliberately does not appear in its dependencies because a repack
  // must not bounce the socket.
  useEffect(() => {
    const connection = connectionRef.current;
    if (connection === null) {
      setConnectionStatus("disconnected");
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
            // The server only ever sends a seat's socket its own `view(state, seatId)`.
            setHandView(message.view as PlayerView);
            viewSnapshotReceived();
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
