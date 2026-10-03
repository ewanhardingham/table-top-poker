import type { ConnectionStatus } from "../store/connectionSlice.js";

export interface SeatSocketHandlers {
  readonly isActive: () => boolean;
  readonly onStatus: (status: ConnectionStatus) => void;
  readonly scheduleRetry: () => void;
}

export function openSeatSocket(
  socket: WebSocket,
  { isActive, onStatus, scheduleRetry }: SeatSocketHandlers,
): void {
  socket.addEventListener("open", () => {
    if (isActive()) onStatus("connected");
  });
  socket.addEventListener("close", () => {
    if (!isActive()) return;
    onStatus("disconnected");
    scheduleRetry();
  });
}
