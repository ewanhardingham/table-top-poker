import { useCallback, useEffect, useMemo, useState } from "react";
import { ActionBar } from "./ActionBar.js";
import { claimSeat, joinRoom } from "./api/rooms.js";
import { useActionIntent } from "./actions/useActionIntent.js";
import { Hand } from "./Hand.js";
import { JoinForm } from "./JoinForm.js";
import { parseRoomCodeFromPath } from "./join/parseRoomCodeFromPath.js";
import { SeatPicker } from "./SeatPicker.js";
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
  const [evictionMessage, setEvictionMessage] = useState<string | null>(null);
  const [seatMoveMessage, setSeatMoveMessage] = useState<string | null>(null);

  useEffect(() => {
    // Silently reclaim a stored seat on mount (docs/phase-1-spec.md §7) — a
    // cleared/absent token just falls through to the normal join flow.
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
    setSeatMoveMessage(null);
  }, [clearSeat]);

  const handleEvicted = useCallback(() => {
    clearSeatToken(window.localStorage);
    setSeatToken(null);
    clearSeat();
    setEvictionMessage("You have been evicted from the room");
    setSeatMoveMessage(null);
  }, [clearSeat]);

  const handleRoomEnded = useCallback(() => {
    clearSeatToken(window.localStorage);
    setSeatToken(null);
    clearSeat();
    clearRoom();
    setSeatMoveMessage(null);
  }, [clearSeat, clearRoom]);

  const handleSeatMoved = useCallback(
    ({ from, to }: { readonly from: number; readonly to: number }) => {
      setSeatMoveMessage(
        `Your seat moved from Seat ${String(from + 1)} to Seat ${String(to + 1)}. Your claim stays with you.`,
      );
      if (roomCode !== null && seatToken !== null) {
        saveSeatToken(window.localStorage, {
          roomCode,
          seatId: to,
          token: seatToken,
        });
      }
    },
    [roomCode, seatToken],
  );

  const wsParams = useMemo(() => {
    if (roomCode === null || seatId === null || seatToken === null) {
      return null;
    }
    return { roomCode, seatId, token: seatToken };
  }, [roomCode, seatId, seatToken]);
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
  const intent = useActionIntent(send);

  const handleJoin = useCallback(
    (code: string) => {
      joinRoom(code)
        .then((view) => {
          setEvictionMessage(null);
          setSeatMoveMessage(null);
          setRoomView(view);
        })
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
          setEvictionMessage(null);
          setSeatMoveMessage(null);
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
            connectionStatus={connectionStatus}
          />
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
      </>
    );
  }

  return (
    <div className="app-shell" data-testid="player-client-shell">
      <StatusBar
        showBadge={wsParams !== null}
        connectionStatus={connectionStatus}
        onToggleSittingOut={handleToggleSittingOut}
        seat={
          playerSeat
            ? { seatId: playerSeat.id, sittingOut: playerSeat.sittingOut }
            : null
        }
      />
      {seatMoveMessage && (
        <div
          data-testid="seat-moved-notice"
          style={{
            flex: "none",
            margin: "10px 18px 0",
            padding: "10px 14px",
            borderRadius: "12px",
            background: "rgba(123,216,143,.1)",
            border: "1px solid rgba(123,216,143,.4)",
            color: "#eef7ef",
            fontSize: "14px",
          }}
        >
          {seatMoveMessage}
        </div>
      )}
      <main className="hand">{content}</main>
    </div>
  );
}
