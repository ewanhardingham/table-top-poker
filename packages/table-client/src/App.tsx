import { useCallback } from "react";
import { createRoom, endSession } from "./api/rooms.js";
import { Board } from "./Board.js";
import { isHandComplete } from "./handComplete.js";
import { RoomPanel } from "./RoomPanel.js";
import { StatusBar } from "./StatusBar.js";
import { useTableStore } from "./store/store.js";
import { useWebSocket } from "./ws/useWebSocket.js";

export function App() {
  const roomCode = useTableStore((state) => state.roomCode);
  const joinUrl = useTableStore((state) => state.joinUrl);
  const qrCodeDataUrl = useTableStore((state) => state.qrCodeDataUrl);
  const seats = useTableStore((state) => state.seats);
  const connectionStatus = useTableStore((state) => state.connectionStatus);
  const handView = useTableStore((state) => state.handView);
  const setRoomCreated = useTableStore((state) => state.setRoomCreated);
  const clearRoom = useTableStore((state) => state.clearRoom);

  const { send } = useWebSocket(roomCode, {
    onRoomEnded: clearRoom,
  });

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

  const handleStartHand = useCallback(() => {
    send({ type: "startHand" });
  }, [send]);

  const handleNextHand = useCallback(() => {
    send({ type: "nextHand" });
  }, [send]);

  const claimedSeatCount = seats.filter((seat) => seat.claimed).length;
  const canStartHand = handView === null && claimedSeatCount >= 2;
  const handComplete = isHandComplete(handView);

  return (
    <div className="app-shell" data-testid="table-client-shell">
      <StatusBar roomCode={roomCode} connectionStatus={connectionStatus} />
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
          <>
            <RoomPanel
              roomCode={roomCode}
              joinUrl={joinUrl}
              qrCodeDataUrl={qrCodeDataUrl}
              seats={seats}
              onEndSession={handleEndSession}
            />
            {canStartHand && (
              <button
                type="button"
                data-testid="start-hand-button"
                onClick={handleStartHand}
              >
                Start hand
              </button>
            )}
            {handComplete && (
              <button
                type="button"
                data-testid="next-hand-button"
                onClick={handleNextHand}
              >
                Next hand
              </button>
            )}
            {handView !== null && <Board view={handView} seats={seats} />}
          </>
        )}
      </main>
    </div>
  );
}
