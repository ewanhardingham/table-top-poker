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

export async function probeSeatGone(
  join: (code: string) => Promise<RoomView>,
  roomCode: string,
  seatId: number,
): Promise<boolean> {
  try {
    const view = await join(roomCode);
    return view.seats.find((seat) => seat.id === seatId)?.claimed !== true;
  } catch (error) {
    return error instanceof RoomRequestError && error.status === 404;
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
