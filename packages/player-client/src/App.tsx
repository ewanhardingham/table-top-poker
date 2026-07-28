import { useCallback, useEffect, useMemo, useState } from "react";
import { ActionBar } from "./ActionBar.js";
import { claimSeat, joinRoom } from "./api/rooms.js";
import { useActionIntent } from "./actions/useActionIntent.js";
import { Hand } from "./Hand.js";
import { JoinForm } from "./JoinForm.js";
import { parseRoomCodeFromPath } from "./join/parseRoomCodeFromPath.js";
import { SeatPicker } from "./SeatPicker.js";
import { ShowdownCard } from "./ShowdownCard.js";
import { StatusBar } from "./StatusBar.js";
import {
  clearSeatToken,
  loadSeatToken,
  saveSeatToken,
} from "./storage/seatToken.js";
import { usePlayerStore } from "./store/store.js";
import { useWebSocket } from "./ws/useWebSocket.js";

export function App() {
  const roomCode = usePlayerStore((state) => state.roomCode);
  const seats = usePlayerStore((state) => state.seats);
  const joinError = usePlayerStore((state) => state.joinError);
  const seatId = usePlayerStore((state) => state.seatId);
  const sittingOut = usePlayerStore((state) => state.sittingOut);
  const connectionStatus = usePlayerStore((state) => state.connectionStatus);
  const handView = usePlayerStore((state) => state.handView);
  const setRoomView = usePlayerStore((state) => state.setRoomView);
  const setJoinError = usePlayerStore((state) => state.setJoinError);
  const setSeat = usePlayerStore((state) => state.setSeat);
  const clearSeat = usePlayerStore((state) => state.clearSeat);
  const clearRoom = usePlayerStore((state) => state.clearRoom);

  const [defaultRoomCode] = useState(() =>
    typeof window === "undefined"
      ? ""
      : (parseRoomCodeFromPath(window.location.pathname) ?? ""),
  );
  const [claimError, setClaimError] = useState<string | null>(null);
  const [seatToken, setSeatToken] = useState<string | null>(null);

  useEffect(() => {
    // Silently reclaim a stored seat on mount (docs/phase-1-spec.md §7) — a
    // cleared/absent token just falls through to the normal join flow.
    const stored = loadSeatToken(window.localStorage);
    if (stored === null) return;
    joinRoom(stored.roomCode)
      .then((view) => {
        setRoomView(view);
        const seat = view.seats.find((s) => s.id === stored.seatId);
        setSeat({
          seatId: stored.seatId,
          sittingOut: seat?.sittingOut ?? false,
        });
        setSeatToken(stored.token);
      })
      .catch(() => {
        clearSeatToken(window.localStorage);
      });
  }, [setRoomView, setSeat]);

  const handleRejected = useCallback(() => {
    clearSeatToken(window.localStorage);
    setSeatToken(null);
    clearSeat();
  }, [clearSeat]);

  const handleRoomEnded = useCallback(() => {
    clearSeatToken(window.localStorage);
    setSeatToken(null);
    clearSeat();
    clearRoom();
  }, [clearSeat, clearRoom]);

  const wsParams = useMemo(() => {
    if (roomCode === null || seatId === null || seatToken === null) {
      return null;
    }
    return { roomCode, seatId, token: seatToken };
  }, [roomCode, seatId, seatToken]);
  const { send } = useWebSocket(wsParams, {
    onRejected: handleRejected,
    onRoomEnded: handleRoomEnded,
  });
  const intent = useActionIntent(send);

  const handleJoin = useCallback(
    (code: string) => {
      joinRoom(code)
        .then(setRoomView)
        .catch(() => {
          setJoinError("room-not-found");
        });
    },
    [setRoomView, setJoinError],
  );

  const handleClaim = useCallback(
    (seat: number) => {
      if (roomCode === null) return;
      claimSeat(roomCode, seat)
        .then((claim) => {
          setClaimError(null);
          setSeat({ seatId: claim.seatId, sittingOut: claim.sittingOut });
          setSeatToken(claim.token);
          saveSeatToken(window.localStorage, {
            roomCode,
            seatId: claim.seatId,
            token: claim.token,
          });
        })
        .catch(() => {
          setClaimError("seat-already-claimed");
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
      <SeatPicker seats={seats} error={claimError} onClaim={handleClaim} />
    );
  } else {
    content = (
      <>
        {handView !== null && (
          <Hand view={handView} connectionStatus={connectionStatus} />
        )}
        {handView !== null && handView.phase === "betting" && (
          <ActionBar
            legalActions={intent.legalActions}
            pendingAction={intent.pendingAction}
            rejection={intent.rejection}
            onFold={intent.fold}
            onCheck={intent.check}
            onCall={intent.call}
            onRaise={intent.raise}
          />
        )}
        {handView !== null &&
          (handView.phase === "showdown" ||
            handView.phase === "folded-out") && (
            <ShowdownCard seatId={seatId} view={handView} />
          )}
      </>
    );
  }

  return (
    <div className="app-shell" data-testid="player-client-shell">
      <StatusBar
        showBadge={wsParams !== null}
        connectionStatus={connectionStatus}
        seat={seatId !== null ? { seatId, sittingOut } : null}
      />
      <main className="hand">{content}</main>
    </div>
  );
}
