import type { RoomView } from "@table-top-poker/protocol";
import { RoomRequestError } from "../api/rooms.js";
import type { ConnectionStatus } from "../store/connectionSlice.js";

export interface SeatSocketHandlers {
  readonly isActive: () => boolean;
  readonly onStatus: (status: ConnectionStatus) => void;
  readonly scheduleRetry: () => void;
  readonly probeSeatGone: () => Promise<boolean>;
  readonly onSeatGone: () => void;
}

export const PROBE_TIMEOUT_MS = 5000;

export async function probeSeatGone(
  join: (code: string, signal?: AbortSignal) => Promise<RoomView>,
  roomCode: string,
): Promise<boolean> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<false>((resolve) => {
    timer = setTimeout(() => {
      controller.abort();
      resolve(false);
    }, PROBE_TIMEOUT_MS);
  });
  const probe = join(roomCode, controller.signal).then(
    () => false,
    (error: unknown) =>
      error instanceof RoomRequestError && error.status === 404,
  );
  try {
    return await Promise.race([probe, timeout]);
  } finally {
    clearTimeout(timer);
  }
}

export function openSeatSocket(
  socket: WebSocket,
  handlers: SeatSocketHandlers,
): void {
  let openedOnce = false;
  socket.addEventListener("open", () => {
    openedOnce = true;
    if (handlers.isActive()) handlers.onStatus("connected");
  });
  socket.addEventListener("close", () => {
    if (!handlers.isActive()) return;
    handlers.onStatus("disconnected");
    if (openedOnce) {
      handlers.scheduleRetry();
      return;
    }
    void handlers.probeSeatGone().then((gone) => {
      if (!handlers.isActive()) return;
      if (gone) handlers.onSeatGone();
      else handlers.scheduleRetry();
    });
  });
}
