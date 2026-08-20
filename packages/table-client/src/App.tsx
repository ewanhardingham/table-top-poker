import {
  countDealInSeats,
  DEFAULT_SEAT_COUNT,
  isHandComplete,
  isHandLive,
  MIN_SEAT_COUNT,
  type ShotClockSettings,
  type SoundSettings,
} from "@table-top-poker/protocol";
import {
  color,
  font,
  fontSize,
  radius,
  unlockAudio,
} from "@table-top-poker/ui-shared";
import { useCallback, useEffect, useState, type CSSProperties } from "react";
import {
  changeSeatCount,
  changeShotClockSettings,
  changeSoundSettings,
  createRoom,
  addBots,
  endSession,
  evictSeat,
  fetchRoom,
} from "./api/rooms.js";
import { Board } from "./Board.js";
import { HandPicker } from "./HandPicker.js";
import { HandReview } from "./replay/HandReview.js";
import { HouseRulesSheet } from "./HouseRulesSheet.js";
import { NotRecordingBanner } from "./NotRecordingBanner.js";
import { SeatCountPicker } from "./SeatCountPicker.js";
import { JoinPanel } from "./JoinPanel.js";
import { SeatMenu } from "./SeatMenu.js";
import { Seats } from "./Seats.js";
import { ShowdownOverlay } from "./ShowdownOverlay.js";
import { SettingsToggle } from "./SettingsToggle.js";
import { StatusBar } from "./StatusBar.js";
import { TableControls } from "./TableControls.js";
import {
  clearHostedRoom,
  loadHostedRoom,
  saveHostedRoom,
} from "./storage/hostedRoom.js";
import { useTableStore } from "./store/store.js";
import { useWebSocket } from "./ws/useWebSocket.js";

const feltSurfaceStyle: CSSProperties = {
  position: "absolute",
  inset: "1em",
  borderRadius: "0.7em",
  background: color.felt,
  boxShadow:
    "inset 0 0 12em 4em rgba(0,0,0,.62), inset 0 2px 0 rgba(255,255,255,.08)",
};

/** Which hand is under review — see Caption in `CONTEXT.md`. */
function ReviewingHand({ handOrdinal }: { readonly handOrdinal: number }) {
  return (
    <span
      data-testid="reviewing-hand"
      style={{
        display: "flex",
        alignItems: "center",
        gap: "0.5em",
        padding: "0.45em 0.9em",
        borderRadius: radius.pill,
        background: color.control,
        border: `1px solid ${color.border}`,
        fontFamily: font.mono,
        fontSize: fontSize.xs,
        fontWeight: 600,
        letterSpacing: "0.16em",
        textTransform: "uppercase",
        color: color.textMuted,
        whiteSpace: "nowrap",
      }}
    >
      {`Reviewing hand ${String(handOrdinal)}`}
    </span>
  );
}

export function App() {
  const roomCode = useTableStore((state) => state.roomCode);
  const joinUrl = useTableStore((state) => state.joinUrl);
  const qrCodeDataUrl = useTableStore((state) => state.qrCodeDataUrl);
  const seats = useTableStore((state) => state.seats);
  const pendingSeatCount = useTableStore((state) => state.pendingSeatCount);
  const pendingShotClock = useTableStore((state) => state.pendingShotClock);
  const soundSettings = useTableStore((state) => state.soundSettings);
  const shotClockSettings = useTableStore((state) => state.shotClockSettings);
  const testMode = useTableStore((state) => state.testMode);
  const connectionStatus = useTableStore((state) => state.connectionStatus);
  const handView = useTableStore((state) => state.handView);
  const recordingStopped = useTableStore((state) => state.recordingStopped);
  const setRoomCreated = useTableStore((state) => state.setRoomCreated);
  const clearRoom = useTableStore((state) => state.clearRoom);
  const clearHand = useTableStore((state) => state.clearHand);
  const handSummaries = useTableStore((state) => state.handSummaries);
  const clearHandHistory = useTableStore((state) => state.clearHandHistory);
  const review = useTableStore((state) => state.review);
  const openReview = useTableStore((state) => state.openReview);
  const closeReview = useTableStore((state) => state.closeReview);

  useEffect(() => {
    const stored = loadHostedRoom(window.localStorage);
    if (stored === null) return;
    fetchRoom(stored.code)
      .then(() => {
        setRoomCreated(stored);
      })
      .catch(() => {
        clearHostedRoom(window.localStorage);
      });
  }, [setRoomCreated]);

  const [joinOpen, setJoinOpen] = useState(false);
  const toggleJoin = useCallback(() => {
    setJoinOpen((open) => !open);
  }, []);

  const [menuSeatId, setMenuSeatId] = useState<number | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const [handPickerOpen, setHandPickerOpen] = useState(false);

  const [showdownCollapsed, setShowdownCollapsed] = useState(false);
  const atShowdown = handView?.phase === "showdown";
  useEffect(() => {
    if (!atShowdown) setShowdownCollapsed(false);
  }, [atShowdown]);
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

  const forgetRoom = useCallback(() => {
    clearHostedRoom(window.localStorage);
    setSettingsOpen(false);
    setHandPickerOpen(false);
    closeReview();
    clearRoom();
    clearHand();
    clearHandHistory();
  }, [clearRoom, clearHand, clearHandHistory, closeReview]);

  const { send } = useWebSocket(roomCode, { onRoomEnded: forgetRoom });

  const [seatCount, setSeatCount] = useState(DEFAULT_SEAT_COUNT);
  const handleCreateRoom = useCallback(() => {
    void unlockAudio();
    createRoom(seatCount)
      .then((room) => {
        saveHostedRoom(window.localStorage, room);
        setRoomCreated(room);
      })
      .catch((error: unknown) => {
        console.error(error);
      });
  }, [seatCount, setRoomCreated]);

  const handleEndSession = useCallback(() => {
    if (!roomCode) return;
    endSession(roomCode)
      .then(forgetRoom)
      .catch((error: unknown) => {
        console.error(error);
      });
  }, [roomCode, forgetRoom]);

  const handleAddBot = useCallback(() => {
    if (roomCode === null || !testMode) return;
    addBots(roomCode, 1).catch((error: unknown) => {
      console.error(error);
    });
  }, [roomCode, testMode]);

  const handleChangeSeatCount = useCallback(
    async (seatCount: number): Promise<void> => {
      if (roomCode === null) return;
      await changeSeatCount(roomCode, seatCount);
    },
    [roomCode],
  );

  const handleChangeSoundSettings = useCallback(
    (next: SoundSettings) => {
      if (roomCode === null) return;
      changeSoundSettings(roomCode, next).catch((error: unknown) => {
        console.error(error);
      });
    },
    [roomCode],
  );

  const handleChangeShotClockSettings = useCallback(
    async (next: ShotClockSettings): Promise<void> => {
      if (roomCode === null) return;
      await changeShotClockSettings(roomCode, next);
    },
    [roomCode],
  );

  const handleStartHand = useCallback(() => {
    void unlockAudio();
    send({ type: "startHand" });
  }, [send]);

  const handleNextHand = useCallback(() => {
    void unlockAudio();
    send({ type: "nextHand" });
  }, [send]);

  const handleSelectHand = useCallback(
    (handOrdinal: number) => {
      openReview(handOrdinal);
      setHandPickerOpen(false);
      send({ type: "get-hand", handOrdinal });
    },
    [openReview, send],
  );

  const handleBackToHands = useCallback(() => {
    closeReview();
    setHandPickerOpen(true);
  }, [closeReview]);

  // A review left open can never swallow the board, so a hand starting takes
  // the felt back with no confirmation (Phase 2 spec #129 §6).
  const handLive = isHandLive(handView);
  useEffect(() => {
    if (!handLive) return;
    closeReview();
    setHandPickerOpen(false);
  }, [handLive, closeReview]);

  const claimedSeatCount = seats.filter((seat) => seat.claimed).length;
  const handInProgress = handView !== null;
  const enoughPlayers = countDealInSeats(seats) >= MIN_SEAT_COUNT;
  const canStartHand = !handInProgress && enoughPlayers;
  const handComplete = isHandComplete(handView);
  const showJoinPanel = !handInProgress || joinOpen;
  const lobbyHint = handInProgress
    ? "New players are dealt in from the next hand"
    : enoughPlayers
      ? `${String(claimedSeatCount)} seated — deal when ready`
      : "Waiting for at least two players";

  return (
    <div className="app-shell" data-testid="table-client-shell">
      <StatusBar
        roomCode={roomCode}
        connectionStatus={connectionStatus}
        showRoomCode={handInProgress && !joinOpen}
        onOpenJoin={toggleJoin}
        leading={
          review === null ? undefined : (
            <ReviewingHand handOrdinal={review.handOrdinal} />
          )
        }
      />
      {recordingStopped && <NotRecordingBanner />}
      <main className="felt">
        {roomCode === null ? (
          <SeatCountPicker
            seatCount={seatCount}
            onSeatCountChange={setSeatCount}
            onCreateRoom={handleCreateRoom}
          />
        ) : review !== null ? (
          <div style={feltSurfaceStyle}>
            <HandReview
              review={review}
              seats={seats}
              onClose={handleBackToHands}
            />
          </div>
        ) : (
          <div style={feltSurfaceStyle}>
            <Seats
              seats={seats}
              view={handView}
              shotClockSeconds={shotClockSettings.seconds}
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
                      canDealNextHand={enoughPlayers}
                      onStartHand={handleStartHand}
                      onNextHand={handleNextHand}
                      onEndSession={handleEndSession}
                      testMode={testMode}
                      onAddBot={handleAddBot}
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
                pendingShotClock={pendingShotClock}
                seats={seats}
                handInProgress={isHandLive(handView)}
                soundSettings={soundSettings}
                shotClockSettings={shotClockSettings}
                onApply={handleChangeSeatCount}
                onApplyShotClock={handleChangeShotClockSettings}
                onChangeSoundSettings={handleChangeSoundSettings}
                onClose={() => {
                  setSettingsOpen(false);
                }}
              />
            )}
            {handInProgress && (
              <TableControls
                canStartHand={canStartHand}
                handComplete={handComplete}
                canDealNextHand={enoughPlayers}
                atShowdown={atShowdown}
                onStartHand={handleStartHand}
                onNextHand={handleNextHand}
                onEndSession={handleEndSession}
                testMode={testMode}
                onAddBot={handleAddBot}
                onViewShowdown={() => {
                  setShowdownCollapsed(false);
                }}
                onReviewHands={() => {
                  setHandPickerOpen(true);
                }}
              />
            )}
            {handPickerOpen && (
              <HandPicker
                summaries={handSummaries}
                seats={seats}
                onSelectHand={handleSelectHand}
                onClose={() => {
                  setHandPickerOpen(false);
                }}
              />
            )}
            {handView?.phase === "showdown" && (
              <ShowdownOverlay
                view={handView}
                seats={seats}
                collapsed={showdownCollapsed}
                canDealNextHand={enoughPlayers}
                onNextHand={handleNextHand}
                onViewTable={() => {
                  setShowdownCollapsed(true);
                }}
              />
            )}
          </div>
        )}
      </main>
    </div>
  );
}
