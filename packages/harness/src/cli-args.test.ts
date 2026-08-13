import { describe, expect, it } from "vitest";
import { parseRecordingOptions, parseSeats } from "./cli-args.js";

describe("parseSeats", () => {
  it("defaults to seats 0, 1, 2", () => {
    expect(parseSeats([])).toEqual([0, 1, 2]);
  });

  it("parses a comma-separated --seats value", () => {
    expect(parseSeats(["--seats", "0,1,2,3"])).toEqual([0, 1, 2, 3]);
  });

  it("rejects a non-integer seat", () => {
    expect(() => parseSeats(["--seats", "0,x"])).toThrow(
      /not a non-negative integer/,
    );
  });
});

describe("parseRecordingOptions", () => {
  it("returns null when --recordings-dir is absent — recording stays optional in the harness", () => {
    expect(parseRecordingOptions(["--seats", "0,1"])).toBeNull();
  });

  it("requires a value after --recordings-dir", () => {
    expect(() => parseRecordingOptions(["--recordings-dir"])).toThrow(
      /--recordings-dir requires/,
    );
  });

  it("defaults --room-id to a sortable timestamp when omitted", () => {
    const options = parseRecordingOptions(["--recordings-dir", "/tmp/rec"]);
    expect(options?.recordingsDir).toBe("/tmp/rec");
    expect(options?.roomId).toMatch(
      /^\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z$/,
    );
  });

  it("uses an explicit --room-id when given", () => {
    const options = parseRecordingOptions([
      "--recordings-dir",
      "/tmp/rec",
      "--room-id",
      "friday-room",
    ]);
    expect(options).toEqual({
      recordingsDir: "/tmp/rec",
      roomId: "friday-room",
    });
  });

  it("rejects a --room-id that isn't a safe path segment", () => {
    expect(() =>
      parseRecordingOptions([
        "--recordings-dir",
        "/tmp/rec",
        "--room-id",
        "../escape",
      ]),
    ).toThrow(/room id/);
  });

  it("requires a value after --room-id", () => {
    expect(() =>
      parseRecordingOptions(["--recordings-dir", "/tmp/rec", "--room-id"]),
    ).toThrow(/--room-id requires/);
  });
});
