import { describe, expect, it } from "vitest";
import { parseLogOptions, parseSeats } from "./cli-args.js";

describe("parseSeats", () => {
  it("defaults to seats 0, 1, 2", () => {
    expect(parseSeats([])).toEqual([0, 1, 2]);
  });

  it("parses a comma-separated --seats value", () => {
    expect(parseSeats(["--seats", "0,1,2,3"])).toEqual([0, 1, 2, 3]);
  });

  it("rejects a non-integer seat", () => {
    expect(() => parseSeats(["--seats", "0,x"])).toThrow(/not a non-negative integer/);
  });
});

describe("parseLogOptions", () => {
  it("returns null when --log-dir is absent", () => {
    expect(parseLogOptions(["--seats", "0,1"])).toBeNull();
  });

  it("requires a value after --log-dir", () => {
    expect(() => parseLogOptions(["--log-dir"])).toThrow(/--log-dir requires/);
  });

  it("defaults --game-id to a sortable timestamp when omitted", () => {
    const options = parseLogOptions(["--log-dir", "/tmp/logs"]);
    expect(options?.logDir).toBe("/tmp/logs");
    expect(options?.gameId).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z$/);
  });

  it("uses an explicit --game-id when given", () => {
    const options = parseLogOptions(["--log-dir", "/tmp/logs", "--game-id", "friday-game"]);
    expect(options).toEqual({ logDir: "/tmp/logs", gameId: "friday-game" });
  });

  it("rejects a --game-id that isn't a safe path segment", () => {
    expect(() =>
      parseLogOptions(["--log-dir", "/tmp/logs", "--game-id", "../escape"]),
    ).toThrow(/game-id/);
  });

  it("requires a value after --game-id", () => {
    expect(() =>
      parseLogOptions(["--log-dir", "/tmp/logs", "--game-id"]),
    ).toThrow(/--game-id requires/);
  });
});
