import type { SeatMove } from "@table-top-poker/protocol";
import { unlockAudio } from "@table-top-poker/ui-shared";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ActionBar } from "./ActionBar.js";
import { claimSeat, joinRoom, leaveSeat } from "./api/rooms.js";
import { otherSeatIsAllIn } from "./actions/allIn.js";
import { useActionIntent } from "./actions/useActionIntent.js";
import { claimErrorCode } from "./claimError.js";
import { Hand } from "./Hand.js";
import { JoinForm } from "./JoinForm.js";
import {
  joinPathForCode,
  parseRoomCodeFromPath,
} from "./join/parseRoomCodeFromPath.js";
import { SeatPicker } from "./SeatPicker.js";
import { SeatMovedNotice } from "./SeatMovedNotice.js";
import { StatusBar } from "./StatusBar.js";
import {
  clearSeatToken,
  loadSeatToken,
  saveSeatToken,
} from "./storage/seatToken.js";
import { usePlayerStore } from "./store/store.js";
import { useLobbyWebSocket } from "./ws/useLobbyWebSocket.js";
import { useWebSocket } from "./ws/useWebSocket.js";

export function App() {
  const roomCode = usePlayerStore((state) => state.roomCode);
  const seats = usePlayerStore((state) => state.seats);
  const joinError = usePlayerStore((state) => state.joinError);
  const seatId = usePlayerStore((state) => state.seatId);
  const displayName = usePlayerStore((state) => state.displayName);
  const connectionStatus = usePlayerStore((state) => state.connectionStatus);
  const hasEverConnected = usePlayerStore((state) => state.hasEverConnected);
  const shotClockSettings = usePlayerStore((state) => state.shotClockSettings);
  const handView = usePlayerStore((state) => state.handView);
  const setRoomView = usePlayerStore((state) => state.setRoomView);
  const setJoinError = usePlayerStore((state) => state.setJoinError);
  const setSeat = usePlayerStore((state) => state.setSeat);
  const moveSeat = usePlayerStore((state) => state.moveSeat);
  const clearSeat = usePlayerStore((state) => state.clearSeat);
  const clearRoom = usePlayerStore((state) => state.clearRoom);
  const clearHand = usePlayerStore((state) => state.clearHand);

  const [defaultRoomCode, setDefaultRoomCode] = useState(() =>
    typeof window === "undefined"
      ? ""
      : (parseRoomCodeFromPath(window.location.pathname) ?? ""),
  );
  const [claimError, setClaimError] = useState<string | null>(null);
  const [seatToken, setSeatToken] = useState<string | null>(null);
  const [evictionMessage, setEvictionMessage] = useState<string | null>(null);
  const [seatMoveMessage, setSeatMoveMessage] = useState<string | null>(null);

  useEffect(() => {
    const stored = loadSeatToken(window.localStorage);
    if (stored === null) return;
    joinRoom(stored.roomCode)
      .then((view) => {
        setEvictionMessage(null);
        setRoomView(view);
        const seat = view.seats.find((s) => s.id === stored.seatId);
        setSeat({
          seatId: stored.seatId,
          sittingOut: seat?.sittingOut ?? false,
          sittingOutReason: seat?.sittingOutReason ?? null,
          displayName: seat?.displayName ?? stored.displayName ?? null,
        });
        setSeatToken(stored.token);
      })
      .catch(() => {
        clearSeatToken(window.localStorage);
      });
  }, [setRoomView, setSeat]);

  useEffect(() => {
    if (typeof window === "undefined" || roomCode === null) return;
    window.history.replaceState(null, "", joinPathForCode(roomCode));
    setDefaultRoomCode(roomCode);
  }, [roomCode]);

  const dropSeat = useCallback(() => {
    clearSeatToken(window.localStorage);
    setSeatToken(null);
    clearSeat();
    clearHand();
  }, [clearSeat, clearHand]);

  const handleRejected = useCallback(() => {
    dropSeat();
    setSeatMoveMessage(null);
  }, [dropSeat]);

  const handleEvicted = useCallback(() => {
    dropSeat();
    setEvictionMessage("You have been evicted from the room");
    setSeatMoveMessage(null);
  }, [dropSeat]);

  const handleRoomEnded = useCallback(() => {
    dropSeat();
    clearRoom();
    setSeatMoveMessage(null);
  }, [dropSeat, clearRoom]);

  const handleSeatMoved = useCallback(
    ({ from, to }: SeatMove) => {
      setSeatMoveMessage(
        `Your seat moved from Seat ${String(from + 1)} to Seat ${String(to + 1)}. Your claim stays with you.`,
      );
      moveSeat(to);
      if (roomCode !== null && seatToken !== null) {
        saveSeatToken(window.localStorage, {
          roomCode,
          seatId: to,
          token: seatToken,
          ...(displayName === null ? {} : { displayName }),
        });
      }
    },
    [displayName, moveSeat, roomCode, seatToken],
  );

  const wsParams = useMemo(() => {
    if (roomCode === null || seatId === null || seatToken === null) {
      return null;
    }
    return { roomCode, seatId, token: seatToken };
  }, [roomCode, seatId, seatToken]);
  useLobbyWebSocket(roomCode !== null && seatId === null ? roomCode : null, {
    onRoomEnded: handleRoomEnded,
  });
  const { send } = useWebSocket(wsParams, {
    onRejected: handleRejected,
    onEvicted: handleEvicted,
    onRoomEnded: handleRoomEnded,
    onSeatMoved: handleSeatMoved,
  });
  const playerSeat =
    seatId === null ? undefined : seats.find((seat) => seat.id === seatId);
  const handleToggleSittingOut = useCallback(() => {
    if (!playerSeat) return;
    send({ type: playerSeat.sittingOut ? "sitIn" : "sitOut" });
  }, [playerSeat, send]);

  const inLiveHand =
    handView?.phase === "betting" &&
    handView.seats.some(
      (snapshot) => snapshot.seatId === handView.yourSeatId && !snapshot.folded,
    );

  const handleLeave = useCallback(() => {
    if (roomCode !== null && seatId !== null && seatToken !== null) {
      leaveSeat(roomCode, seatId, seatToken);
    }
    dropSeat();
    clearRoom();
    setSeatMoveMessage(null);
    setEvictionMessage(null);
  }, [roomCode, seatId, seatToken, dropSeat, clearRoom]);

  const intent = useActionIntent(send);
  const allIn =
    handView?.phase === "betting" &&
    (handView.seats.find((snapshot) => snapshot.seatId === handView.yourSeatId)
      ?.allIn ??
      false);

  const handleJoin = useCallback(
    (code: string) => {
      joinRoom(code)
        .then((view) => {
          setEvictionMessage(null);
          setSeatMoveMessage(null);
          clearHand();
          setRoomView(view);
        })
        .catch(() => {
          setJoinError("room-not-found");
        });
    },
    [setRoomView, setJoinError, clearHand],
  );

  const handleClaim = useCallback(
    (seat: number, name: string) => {
      if (roomCode === null) return;
      void unlockAudio();
      claimSeat(roomCode, seat, name)
        .then((claim) => {
          setClaimError(null);
          setEvictionMessage(null);
          setSeatMoveMessage(null);
          setSeat({
            seatId: claim.seatId,
            sittingOut: claim.sittingOut,
            sittingOutReason: claim.sittingOutReason,
            displayName: claim.displayName,
          });
          setSeatToken(claim.token);
          saveSeatToken(window.localStorage, {
            roomCode,
            seatId: claim.seatId,
            token: claim.token,
            displayName: claim.displayName,
          });
        })
        .catch((error: unknown) => {
          setClaimError(claimErrorCode(error));
        });
    },
    [roomCode, setSeat],
  );

  let content;
  if (roomCode === null) {
    content = (
      <JoinForm
        defaultRoomCode={defaultRoomCode}
        error={joinError}
        onSubmit={handleJoin}
      />
    );
  } else if (seatId === null) {
    content = (
      <SeatPicker
        seats={seats}
        error={claimError}
        evictionMessage={evictionMessage}
        onClaim={handleClaim}
      />
    );
  } else {
    content = (
      <>
        {handView !== null && (
          <Hand
            view={handView}
            seatId={seatId}
            seats={seats}
            connectionStatus={connectionStatus}
            shotClockSeconds={shotClockSettings.seconds}
            intent={intent}
          />
        )}
        {handView !== null && handView.phase === "betting" && !allIn && (
          <ActionBar
            legalActions={intent.legalActions}
            pendingAction={intent.pendingAction}
            rejection={intent.rejection}
            onFold={intent.fold}
            onCheck={intent.check}
            onCall={intent.call}
            onRaise={intent.raise}
            facingAllIn={otherSeatIsAllIn(handView.seats, handView.yourSeatId)}
            onAllIn={intent.allIn}
          />
        )}
      </>
    );
  }

  return (
    <div className="app-shell" data-testid="player-client-shell">
      <StatusBar
        showBadge={wsParams !== null}
        connectionStatus={connectionStatus}
        hasEverConnected={hasEverConnected}
        inLiveHand={inLiveHand}
        onToggleSittingOut={handleToggleSittingOut}
        onLeave={handleLeave}
        seat={
          playerSeat
            ? {
                seatId: playerSeat.id,
                displayName: playerSeat.displayName ?? null,
                sittingOut: playerSeat.sittingOut,
                sittingOutReason: playerSeat.sittingOutReason,
              }
            : null
        }
      />
      {seatMoveMessage && <SeatMovedNotice message={seatMoveMessage} />}
      <main className="hand">{content}</main>
    </div>
  );
}
