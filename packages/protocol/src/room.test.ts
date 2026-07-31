import { describe, expect, it } from "vitest";
import {
  CreateRoomRequestSchema,
  DEFAULT_SEAT_COUNT,
  MAX_SEAT_COUNT,
  MIN_SEAT_COUNT,
} from "./room.js";

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
