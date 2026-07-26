import { useCallback, useEffect, useMemo, useState } from "react";
import { claimSeat, joinRoom } from "./api/rooms.js";
import { Hand } from "./Hand.js";
import { JoinForm } from "./JoinForm.js";
import { parseRoomCodeFromPath } from "./join/parseRoomCodeFromPath.js";
import { SeatPanel } from "./SeatPanel.js";
import { SeatPicker } from "./SeatPicker.js";
import { StatusBar } from "./StatusBar.js";
import { saveSeatToken } from "./storage/seatToken.js";
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

  const [defaultRoomCode, setDefaultRoomCode] = useState("");
  const [claimError, setClaimError] = useState<string | null>(null);
  const [seatToken, setSeatToken] = useState<string | null>(null);

  useEffect(() => {
    const fromPath = parseRoomCodeFromPath(window.location.pathname);
    if (fromPath) setDefaultRoomCode(fromPath);
  }, []);

  const wsParams = useMemo(() => {
    if (roomCode === null || seatId === null || seatToken === null) {
      return null;
    }
    return { roomCode, seatId, token: seatToken };
  }, [roomCode, seatId, seatToken]);
  useWebSocket(wsParams);

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
        <SeatPanel seatId={seatId} sittingOut={sittingOut} />
        {handView !== null && <Hand view={handView} />}
      </>
    );
  }

  return (
    <div className="app-shell" data-testid="player-client-shell">
      <StatusBar
        showBadge={wsParams !== null}
        connectionStatus={connectionStatus}
      />
      <main className="hand">{content}</main>
    </div>
  );
}
