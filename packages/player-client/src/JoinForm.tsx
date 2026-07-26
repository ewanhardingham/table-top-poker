import { useState } from "react";

export interface JoinFormProps {
  readonly defaultRoomCode: string;
  readonly error: string | null;
  readonly onSubmit: (roomCode: string) => void;
}

export function JoinForm({ defaultRoomCode, error, onSubmit }: JoinFormProps) {
  const [roomCode, setRoomCode] = useState(defaultRoomCode);

  return (
    <form
      data-testid="join-form"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit(roomCode.trim().toUpperCase());
      }}
    >
      <input
        data-testid="room-code-input"
        value={roomCode}
        maxLength={4}
        onChange={(event) => {
          setRoomCode(event.target.value);
        }}
      />
      <button type="submit" data-testid="join-room-button">
        Join room
      </button>
      {error && <div data-testid="join-error">{error}</div>}
    </form>
  );
}
