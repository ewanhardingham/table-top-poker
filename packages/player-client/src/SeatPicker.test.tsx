import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SeatPicker, selectionLostMessage } from "./SeatPicker.js";

describe("selectionLostMessage", () => {
  const free = {
    id: 2,
    claimed: false,
    sittingOut: false,
    sittingOutReason: null,
    disconnected: false,
  } as const;

  it("keeps a still-free selection", () => {
    expect(selectionLostMessage(2, free)).toBeNull();
  });

  it("explains a selection another player claimed first", () => {
    expect(selectionLostMessage(2, { ...free, claimed: true })).toContain(
      "Seat 3 was just taken",
    );
  });

  it("explains a selection a seat-count change removed", () => {
    expect(selectionLostMessage(5, undefined)).toContain(
      "Seat 6 is no longer at this table",
    );
  });
});

describe("SeatPicker", () => {
  it("offers a claim button for each free seat and marks taken seats", () => {
    const html = renderToStaticMarkup(
      <SeatPicker
        error={null}
        onClaim={() => undefined}
        seats={[
          {
            id: 0,
            claimed: false,
            sittingOut: false,
            sittingOutReason: null,
            disconnected: false,
          },
          {
            id: 1,
            claimed: true,
            sittingOut: false,
            sittingOutReason: null,
            disconnected: false,
          },
        ]}
      />,
    );

    expect(html).toContain('data-testid="seat-option-0"');
    expect(html).toContain('data-testid="claim-seat-0"');
    expect(html).not.toContain('data-testid="claim-seat-1"');
    expect(html).toContain("Taken");
  });

  it("sizes the seat grid rows to the number of seats", () => {
    const html = renderToStaticMarkup(
      <SeatPicker
        error={null}
        onClaim={() => undefined}
        seats={Array.from({ length: 6 }, (_, id) => ({
          id,
          claimed: false,
          sittingOut: false,
          sittingOutReason: null,
          disconnected: false,
        }))}
      />,
    );

    expect(html).toContain('data-testid="seat-grid"');
    expect(html).toContain('data-seat-count="6"');
    expect(html).toContain("grid-template-columns:repeat(2, minmax(0, 1fr));");
    expect(html).toContain("grid-template-rows:repeat(3, minmax(0, 1fr));");
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

  it("explains when a seat disappeared while the picker was open", () => {
    const html = renderToStaticMarkup(
      <SeatPicker
        error="seat-not-found"
        onClaim={() => undefined}
        seats={[]}
      />,
    );

    expect(html).toContain("seat is no longer available");
  });

  it("shows a friendly message for a duplicate display name", () => {
    const html = renderToStaticMarkup(
      <SeatPicker
        error="duplicate-display-name"
        onClaim={() => undefined}
        seats={[]}
      />,
    );

    expect(html).toContain("name is already taken");
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
