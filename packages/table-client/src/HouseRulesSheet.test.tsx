import {
  DEFAULT_SOUND_SETTINGS,
  type SeatView,
} from "@table-top-poker/protocol";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { HouseRulesSheet } from "./HouseRulesSheet.js";

const seats: SeatView[] = [
  {
    id: 0,
    claimed: true,
    displayName: "Avery",
    sittingOut: false,
    sittingOutReason: null,
    disconnected: false,
  },
  {
    id: 1,
    claimed: false,
    sittingOut: false,
    sittingOutReason: null,
    disconnected: false,
  },
  {
    id: 2,
    claimed: false,
    sittingOut: false,
    sittingOutReason: null,
    disconnected: false,
  },
  {
    id: 3,
    claimed: true,
    displayName: "Blair",
    sittingOut: true,
    sittingOutReason: "voluntary",
    disconnected: false,
  },
  {
    id: 4,
    claimed: false,
    sittingOut: false,
    sittingOutReason: null,
    disconnected: false,
  },
  {
    id: 5,
    claimed: true,
    displayName: "Casey",
    sittingOut: false,
    sittingOutReason: null,
    disconnected: true,
  },
  {
    id: 6,
    claimed: false,
    sittingOut: false,
    sittingOutReason: null,
    disconnected: false,
  },
  {
    id: 7,
    claimed: false,
    sittingOut: false,
    sittingOutReason: null,
    disconnected: false,
  },
];

const noop = () => {
  /* unused */
};

describe("HouseRulesSheet", () => {
  it("shows the chosen house-rules surface and a repack preview", () => {
    const html = renderToStaticMarkup(
      <HouseRulesSheet
        seatCount={8}
        pendingSeatCount={4}
        seats={seats}
        handInProgress
        soundSettings={DEFAULT_SOUND_SETTINGS}
        onApply={noop}
        onChangeSoundSettings={noop}
        onClose={noop}
      />,
    );

    expect(html).toContain('data-testid="house-rules-sheet"');
    expect(html).toContain("House rules");
    expect(html).toContain("Blair → Seat 2");
    expect(html).toContain("Casey → Seat 3");
    expect(html).toContain("Applies from the next hand");
  });

  it("disables decrement at the no-eviction floor", () => {
    const html = renderToStaticMarkup(
      <HouseRulesSheet
        seatCount={8}
        pendingSeatCount={3}
        seats={seats}
        handInProgress
        soundSettings={DEFAULT_SOUND_SETTINGS}
        onApply={noop}
        onChangeSoundSettings={noop}
        onClose={noop}
      />,
    );

    expect(html).toMatch(/data-testid="seat-count-decrement"[^>]*disabled=""/);
    expect(html).toContain("Between 3 and 8 seats.");
    expect(html).toContain("3 seated");
    expect(html).not.toContain("no one is evicted here");
    expect(html).not.toContain("Everyone keeps the seat they are in.");
  });

  it("labels a growth as immediate", () => {
    const html = renderToStaticMarkup(
      <HouseRulesSheet
        seatCount={4}
        pendingSeatCount={null}
        seats={seats.slice(0, 4)}
        handInProgress
        soundSettings={DEFAULT_SOUND_SETTINGS}
        onApply={noop}
        onChangeSoundSettings={noop}
        onClose={noop}
      />,
    );

    expect(html).toContain("Applies immediately");
  });

  it("renders the sound toggles reflecting the room settings", () => {
    const html = renderToStaticMarkup(
      <HouseRulesSheet
        seatCount={4}
        pendingSeatCount={null}
        seats={seats.slice(0, 4)}
        handInProgress
        soundSettings={{
          sounds: true,
          cards: false,
          actions: true,
          notifications: true,
        }}
        onApply={noop}
        onChangeSoundSettings={noop}
        onClose={noop}
      />,
    );

    expect(html).toContain('data-testid="sound-master-toggle"');
    // Attribute order in the rendered tag is aria-checked, aria-label,
    // data-testid, [disabled], style — so these contiguous substrings pin both
    // the checked state and, via data-testid → style, that no disabled sits
    // between them (master on ⇒ categories interactive).
    expect(html).toContain(
      'aria-checked="false" aria-label="Cards" data-testid="sound-cards-toggle" style=',
    );
    expect(html).toContain(
      'aria-checked="true" aria-label="Actions" data-testid="sound-actions-toggle" style=',
    );
    expect(html).toContain(
      'aria-checked="true" aria-label="Notifications" data-testid="sound-notifications-toggle" style=',
    );
  });

  it("disables the category toggles when the master is off", () => {
    const html = renderToStaticMarkup(
      <HouseRulesSheet
        seatCount={4}
        pendingSeatCount={null}
        seats={seats.slice(0, 4)}
        handInProgress
        soundSettings={{
          sounds: false,
          cards: true,
          actions: true,
          notifications: true,
        }}
        onApply={noop}
        onChangeSoundSettings={noop}
        onClose={noop}
      />,
    );

    expect(html).toContain('data-testid="sound-cards-toggle" disabled=""');
    expect(html).toContain('data-testid="sound-actions-toggle" disabled=""');
    expect(html).toContain(
      'data-testid="sound-notifications-toggle" disabled=""',
    );
  });
});
