import { describe, expect, it } from "vitest";
import {
  joinPathForCode,
  parseRoomCodeFromPath,
} from "./parseRoomCodeFromPath.js";

describe("parseRoomCodeFromPath", () => {
  it("extracts and upper-cases a room code from a /join/:code path", () => {
    expect(parseRoomCodeFromPath("/join/ab3d")).toBe("AB3D");
  });

  it("returns null for the root path", () => {
    expect(parseRoomCodeFromPath("/")).toBeNull();
  });

  it("returns null for a code of the wrong length", () => {
    expect(parseRoomCodeFromPath("/join/abc")).toBeNull();
  });
});

describe("joinPathForCode", () => {
  it("builds the /join/:code path for a room", () => {
    expect(joinPathForCode("AB3D")).toBe("/join/AB3D");
  });

  it("round-trips with parseRoomCodeFromPath", () => {
    expect(parseRoomCodeFromPath(joinPathForCode("AB3D"))).toBe("AB3D");
  });
});
