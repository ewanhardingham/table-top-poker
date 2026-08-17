const DIGITS = "0123456789".replace(/[01258]/g, "");
const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".replace(/[BILOSZ]/g, "");

export const ROOM_CODE_ALPHABET = DIGITS + LETTERS;

const ROOM_CODE_LENGTH = 4;

function rollCode(random: () => number): string {
  let code = "";
  for (let i = 0; i < ROOM_CODE_LENGTH; i++) {
    const index = Math.floor(random() * ROOM_CODE_ALPHABET.length);
    const char = ROOM_CODE_ALPHABET[index];
    if (char === undefined) {
      throw new Error(`room code index ${String(index)} out of range`);
    }
    code += char;
  }
  return code;
}

export function generateRoomCode(
  isTaken: (code: string) => boolean,
  random: () => number = Math.random,
): string {
  let code = rollCode(random);
  while (isTaken(code)) {
    code = rollCode(random);
  }
  return code;
}
