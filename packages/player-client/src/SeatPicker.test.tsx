import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SeatPicker } from "./SeatPicker.js";

describe("SeatPicker", () => {
  it("offers a claim button for each free seat and marks taken seats", () => {
    const html = renderToStaticMarkup(
      <SeatPicker
        error={null}
        onClaim={() => undefined}
        seats={[
          { id: 0, claimed: false, sittingOut: false, disconnected: false },
          { id: 1, claimed: true, sittingOut: false, disconnected: false },
        ]}
      />,
    );

    expect(html).toContain('data-testid="seat-option-0"');
    expect(html).toContain('data-testid="claim-seat-0"');
    expect(html).not.toContain('data-testid="claim-seat-1"');
    expect(html).toContain("Taken");
  });

  it("shows a friendly message for a known claim error", () => {
    const html = renderToStaticMarkup(
      <SeatPicker
        error="seat-already-claimed"
        onClaim={() => undefined}
        seats={[]}
      />,
    );
    expect(html).toContain('data-testid="claim-error"');
    expect(html).toContain("pick another");
  });

  it("omits the error element when there is none", () => {
    const html = renderToStaticMarkup(
      <SeatPicker error={null} onClaim={() => undefined} seats={[]} />,
    );
    expect(html).not.toContain('data-testid="claim-error"');
  });

  it("shows the eviction message above the seat choices", () => {
    const html = renderToStaticMarkup(
      <SeatPicker
        error={null}
        evictionMessage="You have been evicted from the room"
        onClaim={() => undefined}
        seats={[]}
      />,
    );

    expect(html).toContain('data-testid="eviction-message"');
    expect(html).toContain("You have been evicted from the room");
    expect(html).toMatch(
      /data-testid="eviction-message"[^>]*font-size:19px[^>]*font-weight:800/,
    );
  });
});
