import { describe, expect, it } from "vitest";
import { parseReplayArgs } from "./replay-args.js";

describe("parseReplayArgs", () => {
  it("parses the room, hand ordinal and defaults to the whole hand", () => {
    expect(parseReplayArgs(["latest", "--hand", "14"], {})).toEqual({
      room: "latest",
      hand: 14,
      selector: { kind: "all" },
      recordingsDir: "./recordings",
    });
  });

  it("rejects a missing <room> positional", () => {
    expect(() => parseReplayArgs(["--hand", "1"], {})).toThrow(/<room>/);
  });

  it("accepts a Room ID that happens to start with '--' — assertValidRoomId permits it", () => {
    expect(parseReplayArgs(["--nightly-run", "--hand", "1"], {}).room).toBe(
      "--nightly-run",
    );
  });

  it("requires --hand", () => {
    expect(() => parseReplayArgs(["latest"], {})).toThrow(/--hand/);
  });

  it("parses --at as a single-position selector", () => {
    expect(
      parseReplayArgs(["room-1", "--hand", "1", "--at", "37"], {}).selector,
    ).toEqual({ kind: "at", position: 37 });
  });

  it("parses a paired --from/--to range", () => {
    expect(
      parseReplayArgs(["room-1", "--hand", "1", "--from", "3", "--to", "9"], {})
        .selector,
    ).toEqual({ kind: "range", from: 3, to: 9 });
  });

  it("rejects --at combined with --from/--to", () => {
    expect(() =>
      parseReplayArgs(
        ["room-1", "--hand", "1", "--at", "1", "--from", "0", "--to", "2"],
        {},
      ),
    ).toThrow(/--at cannot be combined/);
  });

  it("rejects --from without --to", () => {
    expect(() =>
      parseReplayArgs(["room-1", "--hand", "1", "--from", "0"], {}),
    ).toThrow(/--from and --to must be given together/);
  });

  it("rejects --from greater than --to", () => {
    expect(() =>
      parseReplayArgs(
        ["room-1", "--hand", "1", "--from", "5", "--to", "2"],
        {},
      ),
    ).toThrow(/--from must not be greater than --to/);
  });

  it("rejects a non-integer --hand", () => {
    expect(() => parseReplayArgs(["room-1", "--hand", "x"], {})).toThrow(
      /--hand must be a non-negative integer/,
    );
  });

  it("defaults --recordings-dir to RECORDINGS_DIR, then ./recordings", () => {
    expect(
      parseReplayArgs(["room-1", "--hand", "1"], {
        RECORDINGS_DIR: "/var/lib/poker/recordings",
      }).recordingsDir,
    ).toBe("/var/lib/poker/recordings");
    expect(parseReplayArgs(["room-1", "--hand", "1"], {}).recordingsDir).toBe(
      "./recordings",
    );
  });

  it("--recordings-dir on argv wins over the environment", () => {
    expect(
      parseReplayArgs(
        ["room-1", "--hand", "1", "--recordings-dir", "/tmp/rec"],
        { RECORDINGS_DIR: "/var/lib/poker/recordings" },
      ).recordingsDir,
    ).toBe("/tmp/rec");
  });
});
