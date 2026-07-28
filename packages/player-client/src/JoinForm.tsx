import {
  PillButton,
  color,
  font,
  fontSize,
  radius,
} from "@table-top-poker/ui-shared";
import type { CSSProperties } from "react";
import { useState } from "react";
import { InlineError } from "./InlineError.js";

export interface JoinFormProps {
  readonly defaultRoomCode: string;
  readonly error: string | null;
  readonly onSubmit: (roomCode: string) => void;
}

const CODE_LENGTH = 4;

/**
 * Digits + uppercase letters, excluding characters easily confused on a
 * phone screen (0/O, 1/I/L, 2/Z, 5/S, 8/B) — mirrors the server's
 * `ROOM_CODE_ALPHABET` (packages/server/src/room-code.ts).
 */
const KEYS = [
  "3",
  "4",
  "6",
  "7",
  "9",
  "A",
  "C",
  "D",
  "E",
  "F",
  "G",
  "H",
  "J",
  "K",
  "M",
  "N",
  "P",
  "Q",
  "R",
  "T",
  "U",
  "V",
  "W",
  "X",
  "Y",
];

const errorCopy: Record<string, string> = {
  "room-not-found": "That room code doesn't exist — check the table screen.",
};

const descriptionStyle: CSSProperties = {
  fontSize: fontSize.md,
  lineHeight: 1.5,
  color: color.textMuted,
};

const boxRowStyle: CSSProperties = {
  display: "flex",
  gap: 10,
};

function boxStyle(active: boolean): CSSProperties {
  return {
    flex: 1,
    aspectRatio: "1 / 1.15",
    borderRadius: radius.control,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontFamily: font.mono,
    fontWeight: 700,
    fontSize: fontSize.codeDigit,
    background: color.controlFill,
    color: color.textBright,
    border: `1px solid ${active ? color.focusBorder : color.border}`,
  };
}

const keypadStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(5, 1fr)",
  gap: 8,
};

const keyStyle: CSSProperties = {
  height: 52,
  borderRadius: radius.control,
  border: `1px solid ${color.border}`,
  background: color.controlFill,
  fontFamily: font.mono,
  fontSize: fontSize.lg,
  fontWeight: 600,
  color: color.text,
};

const disabledJoinStyle: CSSProperties = {
  background: color.controlFill,
  color: color.disabledText,
  border: `1px solid ${color.border}`,
  boxShadow: "none",
  cursor: "default",
};

export function JoinForm({ defaultRoomCode, error, onSubmit }: JoinFormProps) {
  const [roomCode, setRoomCode] = useState(defaultRoomCode);
  const complete = roomCode.length === CODE_LENGTH;

  const press = (key: string) => {
    setRoomCode((code) => (code.length < CODE_LENGTH ? code + key : code));
  };
  const backspace = () => {
    setRoomCode((code) => code.slice(0, -1));
  };

  return (
    <div
      data-testid="join-form"
      style={{
        flex: 1,
        minHeight: 0,
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        gap: 20,
        padding: "0 26px 34px",
      }}
    >
      <div style={descriptionStyle}>
        Enter the four letters shown in the middle of the table, or scan its
        code.
      </div>
      <div style={boxRowStyle}>
        {Array.from({ length: CODE_LENGTH }, (_, i) => (
          <div
            key={i}
            data-testid={`join-code-box-${String(i)}`}
            style={boxStyle(roomCode.length === i)}
          >
            {roomCode[i] ?? ""}
          </div>
        ))}
      </div>
      <div style={keypadStyle}>
        {KEYS.map((key) => (
          <button
            key={key}
            type="button"
            data-testid={`join-key-${key}`}
            onClick={() => {
              press(key);
            }}
            style={keyStyle}
          >
            {key}
          </button>
        ))}
        <button
          type="button"
          data-testid="join-key-backspace"
          onClick={backspace}
          style={keyStyle}
        >
          ⌫
        </button>
      </div>
      <PillButton
        size="lg"
        data-testid="join-room-button"
        disabled={!complete}
        onClick={() => {
          onSubmit(roomCode);
        }}
        style={complete ? undefined : disabledJoinStyle}
      >
        {complete ? "Join room" : "Enter 4 letters"}
      </PillButton>
      {error && (
        <InlineError testId="join-error" message={errorCopy[error] ?? error} />
      )}
    </div>
  );
}
