import type {
  ClientCommand,
  ServerMessage,
  TableView,
} from "@table-top-poker/protocol";
import {
  applyRoomSoundSettings,
  createBeatQueue,
  onHandUpdate,
  tableBeatDuration,
} from "@table-top-poker/ui-shared";
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

    // The table reveals hand updates as serial beats — a player action, then
    // the board deal it triggers — so the board's animation and taps wait out
    // the closing action's sound instead of landing on top of it (#186). Each
    // beat applies its view (the animation) and fires its sound together.
    const beats = createBeatQueue<TableView>({
      now: () => Date.now(),
      schedule: (fn, delayMs) => {
        setTimeout(fn, delayMs);
      },
      apply: (beat) => {
        if (!active) return;
        setHandView(beat.view);
        onHandUpdate({ surface: "table", event: beat.event, view: beat.view });
      },
      duration: tableBeatDuration,
    });

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
          // Mirror the room's sound settings (#182) into the audio engine's
          // gate so cue playback honours the table-controlled master/category.
          applyRoomSoundSettings(message.view.soundSettings);
        } else if (message.type === "hand-update") {
          // The server only ever sends a table-role socket a `view(state, 'table')`.
          // Queue it as a beat; the queue applies the view and fires the cue,
          // paced so a board deal clears the action that closed the street.
          beats.push({ event: message.event, view: message.view });
        } else if (message.type === "view-snapshot") {
          // A snapshot (fresh join/reconnect) is not a beat: drop any pending
          // ones so a reconnect can't replay a delayed burst (#175), and show
          // the authoritative state at once, silently.
          beats.clear();
          setHandView(message.view);
        } else if (message.type === "room-ended") {
          optionsRef.current.onRoomEnded?.();
        }
      });
    }

    connect();

    return () => {
      active = false;
      beats.clear();
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
