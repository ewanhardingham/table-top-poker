import { describe, expect, it } from "vitest";
import {
  ChangeShotClockRequestSchema,
  ChangeSeatCountRequestSchema,
  ClaimSeatRequestSchema,
  CreateRoomRequestSchema,
  DEFAULT_SHOT_CLOCK,
  DEFAULT_SEAT_COUNT,
  MAX_DISPLAY_NAME_LENGTH,
  MAX_SEAT_COUNT,
  MAX_SHOT_CLOCK_SECONDS,
  MIN_SHOT_CLOCK_SECONDS,
  MIN_SEAT_COUNT,
  ShotClockSettingsSchema,
} from "./room.js";

describe("ClaimSeatRequestSchema", () => {
  it("requires and trims a non-empty display name", () => {
    expect(ClaimSeatRequestSchema.parse({ displayName: " Avery " })).toEqual({
      displayName: "Avery",
    });
    expect(
      ClaimSeatRequestSchema.safeParse({
        displayName: "1234567890",
      }).success,
    ).toBe(true);
    expect(
      ClaimSeatRequestSchema.safeParse({
        displayName: "1".repeat(MAX_DISPLAY_NAME_LENGTH + 1),
      }).success,
    ).toBe(false);
    expect(ClaimSeatRequestSchema.safeParse({}).success).toBe(false);
    expect(
      ClaimSeatRequestSchema.safeParse({ displayName: "   " }).success,
    ).toBe(false);
  });

  it("rejects extra fields", () => {
    expect(
      ClaimSeatRequestSchema.safeParse({ displayName: "Avery", public: true })
        .success,
    ).toBe(false);
  });
});

describe("CreateRoomRequestSchema", () => {
  it("accepts every seat count in the 2-8 range", () => {
    for (
      let seatCount = MIN_SEAT_COUNT;
      seatCount <= MAX_SEAT_COUNT;
      seatCount++
    ) {
      expect(CreateRoomRequestSchema.parse({ seatCount })).toEqual({
        seatCount,
      });
    }
  });

  it("requires a seat count — the creator always states the table size", () => {
    expect(CreateRoomRequestSchema.safeParse({}).success).toBe(false);
    expect(DEFAULT_SEAT_COUNT).toBe(MAX_SEAT_COUNT);
  });

  it("rejects counts outside the range", () => {
    for (const seatCount of [0, 1, 9, -3]) {
      expect(CreateRoomRequestSchema.safeParse({ seatCount }).success).toBe(
        false,
      );
    }
  });

  it("rejects non-integer and non-numeric counts", () => {
    for (const seatCount of [2.5, "4", null, Number.NaN]) {
      expect(CreateRoomRequestSchema.safeParse({ seatCount }).success).toBe(
        false,
      );
    }
  });
});

describe("ShotClockSettingsSchema", () => {
  it("defaults a room to a disabled 90-second clock", () => {
    expect(DEFAULT_SHOT_CLOCK).toEqual({ enabled: false, seconds: 90 });
  });

  it("accepts an enabled clock at the inclusive duration bounds", () => {
    expect(
      ShotClockSettingsSchema.parse({
        enabled: true,
        seconds: MIN_SHOT_CLOCK_SECONDS,
      }),
    ).toEqual({ enabled: true, seconds: MIN_SHOT_CLOCK_SECONDS });
    expect(
      ShotClockSettingsSchema.parse({
        enabled: false,
        seconds: MAX_SHOT_CLOCK_SECONDS,
      }),
    ).toEqual({ enabled: false, seconds: MAX_SHOT_CLOCK_SECONDS });
  });

  it("requires a distinct boolean enabled flag and integer seconds", () => {
    for (const enabled of [0, 1, "true", null]) {
      expect(
        ShotClockSettingsSchema.safeParse({ enabled, seconds: 90 }).success,
      ).toBe(false);
    }
    for (const seconds of [0, 4, 601, 5.5, "90", null]) {
      expect(
        ShotClockSettingsSchema.safeParse({ enabled: true, seconds }).success,
      ).toBe(false);
    }
  });

  it("rejects extra fields", () => {
    expect(
      ShotClockSettingsSchema.safeParse({
        enabled: true,
        seconds: 90,
        timeout: 0,
      }).success,
    ).toBe(false);
  });
});

describe("ChangeShotClockRequestSchema", () => {
  it("uses the same integer duration bounds and strict body shape", () => {
    expect(
      ChangeShotClockRequestSchema.parse({ enabled: false, seconds: 90 }),
    ).toEqual({ enabled: false, seconds: 90 });
    expect(
      ChangeShotClockRequestSchema.safeParse({
        enabled: true,
        seconds: MIN_SHOT_CLOCK_SECONDS - 1,
      }).success,
    ).toBe(false);
    expect(
      ChangeShotClockRequestSchema.safeParse({
        enabled: true,
        seconds: 90,
        extra: true,
      }).success,
    ).toBe(false);
  });
});

describe("ChangeSeatCountRequestSchema", () => {
  it("reuses the room seat-count bounds", () => {
    expect(
      ChangeSeatCountRequestSchema.parse({ seatCount: MIN_SEAT_COUNT }),
    ).toEqual({
      seatCount: MIN_SEAT_COUNT,
    });
    expect(
      ChangeSeatCountRequestSchema.safeParse({ seatCount: MAX_SEAT_COUNT + 1 })
        .success,
    ).toBe(false);
  });

  it("rejects extra fields", () => {
    expect(
      ChangeSeatCountRequestSchema.safeParse({
        seatCount: 4,
        reason: "smaller",
      }).success,
    ).toBe(false);
  });
});
