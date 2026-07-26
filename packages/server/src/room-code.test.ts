import { describe, expect, it } from "vitest";
import { ROOM_CODE_ALPHABET, generateRoomCode } from "./room-code.js";

describe("ROOM_CODE_ALPHABET", () => {
  it("is digits and uppercase letters, excluding confusable characters", () => {
    expect(ROOM_CODE_ALPHABET).toBe("34679ACDEFGHJKMNPQRTUVWXY");
  });

  it("has 25 characters (36 alphanumerics minus 11 excluded)", () => {
    expect(ROOM_CODE_ALPHABET).toHaveLength(25);
  });
});

describe("generateRoomCode", () => {
  it("returns a 4-character code drawn from the confusable-excluded alphabet", () => {
    const code = generateRoomCode(
      () => false,
      () => 0,
    );
    expect(code).toHaveLength(4);
    for (const char of code) {
      expect(ROOM_CODE_ALPHABET).toContain(char);
    }
  });

  it("is deterministic given a fixed random source", () => {
    const random = () => 0.5;
    expect(generateRoomCode(() => false, random)).toBe(
      generateRoomCode(() => false, random),
    );
  });

  it("re-rolls on collision against live rooms", () => {
    const randoms = [0, 0, 0, 0, 0.9, 0.9, 0.9, 0.9];
    let calls = 0;
    const random = () => randoms[calls++] ?? 0;

    const firstCode = generateRoomCode(
      () => false,
      () => 0,
    );

    let isTakenCalls = 0;
    const isTaken = (code: string) => {
      isTakenCalls++;
      return code === firstCode;
    };

    const code = generateRoomCode(isTaken, random);
    expect(isTakenCalls).toBe(2);
    expect(code).not.toBe(firstCode);
  });
});
