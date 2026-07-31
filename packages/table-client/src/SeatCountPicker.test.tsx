import { MAX_SEAT_COUNT, MIN_SEAT_COUNT } from "@table-top-poker/protocol";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SeatCountPicker } from "./SeatCountPicker.js";

const noop = () => {
  /* unused in these tests */
};

function render(seatCount = MAX_SEAT_COUNT) {
  return renderToStaticMarkup(
    <SeatCountPicker
      seatCount={seatCount}
      onSeatCountChange={noop}
      onCreateRoom={noop}
    />,
  );
}

describe("SeatCountPicker", () => {
  it("offers every seat count from 2 to 8", () => {
    const html = render();
    for (let count = MIN_SEAT_COUNT; count <= MAX_SEAT_COUNT; count++) {
      expect(html).toContain(
        `data-testid="seat-count-${String(count)}-button"`,
      );
    }
    expect(html).not.toContain('data-testid="seat-count-1-button"');
    expect(html).not.toContain('data-testid="seat-count-9-button"');
  });

  it("marks only the chosen count as selected", () => {
    const html = render(4);
    expect(html).toContain(
      '<button type="button" data-testid="seat-count-4-button" aria-pressed="true"',
    );
    expect(html).toContain(
      '<button type="button" data-testid="seat-count-8-button" aria-pressed="false"',
    );
  });

  it("keeps the Create room action on the picker step", () => {
    const html = render();
    expect(html).toContain('data-testid="create-room-button"');
    expect(html).toContain("Create room");
  });

  it("names the chosen table size in the hint", () => {
    expect(render(2)).toContain("Heads-up");
    expect(render(6)).toContain("6 seats");
  });
});
