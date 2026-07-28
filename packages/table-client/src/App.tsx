import { PillButton, color } from "@table-top-poker/ui-shared";
import { useCallback, useState } from "react";
import { createRoom, endSession } from "./api/rooms.js";
import { Board } from "./Board.js";
import { isHandComplete } from "./handComplete.js";
import { JoinCodeToggle } from "./JoinCodeToggle.js";
import { JoinPanel } from "./JoinPanel.js";
import { Seats } from "./Seats.js";
import { StatusBar } from "./StatusBar.js";
import { TableControls } from "./TableControls.js";
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

  const [joinOpen, setJoinOpen] = useState(false);
  const toggleJoin = useCallback(() => {
    setJoinOpen((open) => !open);
  }, []);

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
  const handInProgress = handView !== null;
  const canStartHand = !handInProgress && claimedSeatCount >= 2;
  const handComplete = isHandComplete(handView);
  const showJoinPanel = !handInProgress || joinOpen;
  const lobbyHint = handInProgress
    ? "New players are dealt in from the next hand"
    : claimedSeatCount >= 2
      ? `${String(claimedSeatCount)} seated — deal when ready`
      : "Waiting for at least two players";

  return (
    <div className="app-shell" data-testid="table-client-shell">
      <StatusBar roomCode={roomCode} connectionStatus={connectionStatus} />
      <main className="felt">
        {roomCode === null ? (
          <PillButton
            size="lg"
            data-testid="create-room-button"
            onClick={handleCreateRoom}
          >
            Create room
          </PillButton>
        ) : (
          <div
            style={{
              position: "absolute",
              inset: "1em",
              borderRadius: "0.7em",
              background: color.felt,
              boxShadow:
                "inset 0 0 12em 4em rgba(0,0,0,.62), inset 0 2px 0 rgba(255,255,255,.08)",
            }}
          >
            <Seats seats={seats} view={handView} />
            {handView !== null && (
              <div
                style={{
                  position: "absolute",
                  inset: 0,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  pointerEvents: "none",
                }}
              >
                <Board view={handView} />
              </div>
            )}
            <JoinCodeToggle
              roomCode={roomCode}
              open={joinOpen}
              onToggle={toggleJoin}
            />
            {showJoinPanel && (
              <JoinPanel
                roomCode={roomCode}
                joinUrl={joinUrl}
                qrCodeDataUrl={qrCodeDataUrl}
                lobbyHint={lobbyHint}
                dismissable={handInProgress}
                onDismiss={toggleJoin}
              />
            )}
            <TableControls
              canStartHand={canStartHand}
              handComplete={handComplete}
              onStartHand={handleStartHand}
              onNextHand={handleNextHand}
              onEndSession={handleEndSession}
            />
          </div>
        )}
      </main>
    </div>
  );
}
