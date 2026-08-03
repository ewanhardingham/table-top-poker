import {
  DEFAULT_SEAT_COUNT,
  isHandComplete,
  isHandLive,
} from "@table-top-poker/protocol";
import { color } from "@table-top-poker/ui-shared";
import { useCallback, useState } from "react";
import {
  changeSeatCount,
  createRoom,
  endSession,
  evictSeat,
} from "./api/rooms.js";
import { Board } from "./Board.js";
import { HouseRulesSheet } from "./HouseRulesSheet.js";
import { SeatCountPicker } from "./SeatCountPicker.js";
import { JoinPanel } from "./JoinPanel.js";
import { SeatMenu } from "./SeatMenu.js";
import { Seats } from "./Seats.js";
import { SettingsToggle } from "./SettingsToggle.js";
import { StatusBar } from "./StatusBar.js";
import { TableControls } from "./TableControls.js";
import { useTableStore } from "./store/store.js";
import { useWebSocket } from "./ws/useWebSocket.js";

export function App() {
  const roomCode = useTableStore((state) => state.roomCode);
  const joinUrl = useTableStore((state) => state.joinUrl);
  const qrCodeDataUrl = useTableStore((state) => state.qrCodeDataUrl);
  const seats = useTableStore((state) => state.seats);
  const pendingSeatCount = useTableStore((state) => state.pendingSeatCount);
  const connectionStatus = useTableStore((state) => state.connectionStatus);
  const handView = useTableStore((state) => state.handView);
  const setRoomCreated = useTableStore((state) => state.setRoomCreated);
  const clearRoom = useTableStore((state) => state.clearRoom);

  const [joinOpen, setJoinOpen] = useState(false);
  const toggleJoin = useCallback(() => {
    setJoinOpen((open) => !open);
  }, []);

  const [menuSeatId, setMenuSeatId] = useState<number | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const handleSeatClick = useCallback((seatId: number) => {
    setMenuSeatId((current) => (current === seatId ? null : seatId));
  }, []);
  const dismissSeatMenu = useCallback(() => {
    setMenuSeatId(null);
  }, []);
  const handleEvictSeat = useCallback(() => {
    if (roomCode === null || menuSeatId === null) return;
    evictSeat(roomCode, menuSeatId).catch((error: unknown) => {
      console.error(error);
    });
    setMenuSeatId(null);
  }, [roomCode, menuSeatId]);

  const handleRoomEnded = useCallback(() => {
    setSettingsOpen(false);
    clearRoom();
  }, [clearRoom]);

  const { send } = useWebSocket(roomCode, {
    onRoomEnded: handleRoomEnded,
  });

  const [seatCount, setSeatCount] = useState(DEFAULT_SEAT_COUNT);
  const handleCreateRoom = useCallback(() => {
    createRoom(seatCount)
      .then(setRoomCreated)
      .catch((error: unknown) => {
        console.error(error);
      });
  }, [seatCount, setRoomCreated]);

  const handleEndSession = useCallback(() => {
    if (!roomCode) return;
    endSession(roomCode)
      .then(() => {
        setSettingsOpen(false);
        clearRoom();
      })
      .catch((error: unknown) => {
        console.error(error);
      });
  }, [roomCode, clearRoom]);

  const handleChangeSeatCount = useCallback(
    (seatCount: number) => {
      if (roomCode === null) return;
      changeSeatCount(roomCode, seatCount)
        .then(() => {
          setSettingsOpen(false);
        })
        .catch((error: unknown) => {
          console.error(error);
        });
    },
    [roomCode],
  );

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
      <StatusBar
        roomCode={roomCode}
        connectionStatus={connectionStatus}
        showRoomCode={handInProgress && !joinOpen}
        onOpenJoin={toggleJoin}
      />
      <main className="felt">
        {roomCode === null ? (
          <SeatCountPicker
            seatCount={seatCount}
            onSeatCountChange={setSeatCount}
            onCreateRoom={handleCreateRoom}
          />
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
            <Seats
              seats={seats}
              view={handView}
              onSeatClick={handleSeatClick}
            />
            {menuSeatId !== null && (
              <SeatMenu
                seatId={menuSeatId}
                seatCount={seats.length}
                displayName={
                  seats.find((seat) => seat.id === menuSeatId)?.displayName ??
                  null
                }
                onEvict={handleEvictSeat}
                onDismiss={dismissSeatMenu}
              />
            )}
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
                <Board view={handView} seats={seats} />
              </div>
            )}
            {showJoinPanel && (
              <JoinPanel
                roomCode={roomCode}
                joinUrl={joinUrl}
                qrCodeDataUrl={qrCodeDataUrl}
                lobbyHint={lobbyHint}
                dismissable={handInProgress}
                onDismiss={toggleJoin}
                controls={
                  handInProgress ? undefined : (
                    <TableControls
                      placement="join-panel"
                      canStartHand={canStartHand}
                      handComplete={handComplete}
                      onStartHand={handleStartHand}
                      onNextHand={handleNextHand}
                      onEndSession={handleEndSession}
                    />
                  )
                }
              />
            )}
            <SettingsToggle
              open={settingsOpen}
              onToggle={() => {
                setSettingsOpen((open) => !open);
              }}
            />
            {settingsOpen && (
              <HouseRulesSheet
                seatCount={seats.length}
                pendingSeatCount={pendingSeatCount}
                seats={seats}
                handInProgress={isHandLive(handView)}
                onApply={handleChangeSeatCount}
                onClose={() => {
                  setSettingsOpen(false);
                }}
              />
            )}
            {handInProgress && (
              <TableControls
                canStartHand={canStartHand}
                handComplete={handComplete}
                onStartHand={handleStartHand}
                onNextHand={handleNextHand}
                onEndSession={handleEndSession}
              />
            )}
          </div>
        )}
      </main>
    </div>
  );
}
