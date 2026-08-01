import { describe, expect, it } from "vitest";
import {
  ChangeSeatCountRequestSchema,
  ClaimSeatRequestSchema,
  CreateRoomRequestSchema,
  DEFAULT_SEAT_COUNT,
  MAX_DISPLAY_NAME_LENGTH,
  MAX_SEAT_COUNT,
  MIN_SEAT_COUNT,
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
