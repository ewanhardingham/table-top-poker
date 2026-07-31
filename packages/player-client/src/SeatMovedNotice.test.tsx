import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SeatMovedNotice } from "./SeatMovedNotice.js";

describe("SeatMovedNotice", () => {
  it("renders the supplied seat move message", () => {
    const html = renderToStaticMarkup(
      <SeatMovedNotice message="Your seat moved to Seat 2." />,
    );

    expect(html).toContain('data-testid="seat-moved-notice"');
    expect(html).toContain("Your seat moved to Seat 2.");
  });
});
