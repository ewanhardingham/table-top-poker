import { useCallback } from "react";
import { createRoom, endSession } from "./api/rooms.js";
import { RoomPanel } from "./RoomPanel.js";
import { useTableStore } from "./store/store.js";
import { useWebSocket } from "./ws/useWebSocket.js";

export function App() {
  const roomCode = useTableStore((state) => state.roomCode);
  const joinUrl = useTableStore((state) => state.joinUrl);
  const qrCodeDataUrl = useTableStore((state) => state.qrCodeDataUrl);
  const seats = useTableStore((state) => state.seats);
  const connectionStatus = useTableStore((state) => state.connectionStatus);
  const setRoomCreated = useTableStore((state) => state.setRoomCreated);
  const clearRoom = useTableStore((state) => state.clearRoom);

  useWebSocket(roomCode);

  const handleCreateRoom = useCallback(() => {
    createRoom()
      .then(setRoomCreated)
      .catch((error: unknown) => {
        console.error(error);
      });
  }, [setRoomCreated]);

  const handleEndSession = useCallback(() => {
    if (!roomCode) return;
    endSession(roomCode)
      .then(clearRoom)
      .catch((error: unknown) => {
        console.error(error);
      });
  }, [roomCode, clearRoom]);

  return (
    <div className="app-shell" data-testid="table-client-shell">
      <header className="status-bar">
        <span>Table Top Poker — Table</span>
        <span data-testid="connection-status" data-status={connectionStatus}>
          {connectionStatus}
        </span>
      </header>
      <main className="felt">
        {roomCode === null ? (
          <button
            type="button"
            data-testid="create-room-button"
            onClick={handleCreateRoom}
          >
            Create room
          </button>
        ) : (
          <RoomPanel
            roomCode={roomCode}
            joinUrl={joinUrl}
            qrCodeDataUrl={qrCodeDataUrl}
            seats={seats}
            onEndSession={handleEndSession}
          />
        )}
      </main>
    </div>
  );
}
