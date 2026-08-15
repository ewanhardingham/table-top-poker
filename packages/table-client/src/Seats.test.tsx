import type { SeatView, TableView } from "@table-top-poker/protocol";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Seats } from "./Seats.js";

const seats: SeatView[] = [
  {
    id: 0,
    claimed: true,
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
  {
    id: 2,
    claimed: true,
    sittingOut: true,
    sittingOutReason: "voluntary",
    disconnected: false,
  },
  {
    id: 3,
    claimed: false,
    sittingOut: false,
    sittingOutReason: null,
    disconnected: false,
  },
];

describe("Seats", () => {
  it("shows a claimed player's display name as a small seat caption", () => {
    const html = renderToStaticMarkup(
      <Seats
        seats={[
          {
            id: 0,
            claimed: true,
            displayName: "Avery",
            sittingOut: false,
            sittingOutReason: null,
            disconnected: false,
          },
          ...seats.slice(1),
        ]}
        view={null}
      />,
    );

    expect(html).toContain('data-testid="seat-pod-0-name"');
    expect(html).toContain("Avery");
  });

  it("shows every seat as open or sitting-out before any hand exists", () => {
    const html = renderToStaticMarkup(<Seats seats={seats} view={null} />);
    expect(html).toMatch(/data-testid="seat-pod-0"[^>]*data-status="in-hand"/);
    expect(html).toMatch(
      /data-testid="seat-pod-2"[^>]*data-status="sitting-out"/,
    );
    expect(html).toMatch(/data-testid="seat-pod-3"[^>]*data-status="open"/);
  });

  it("gives a voluntary sit-out a quiet local treatment", () => {
    const html = renderToStaticMarkup(<Seats seats={seats} view={null} />);

    expect(html).toMatch(
      /data-testid="seat-pod-2-sitting-out"[^>]*>[\s\S]*Sitting out[\s\S]*Until you sit in[\s\S]*<\/div>/,
    );
    expect(html).toContain('data-testid="seat-pod-2-sitting-out-marker"');
    expect(html).toMatch(
      /data-testid="seat-pod-2-avatar"[^>]*style="[^"]*border:1px dashed/,
    );
    expect(html).not.toContain('data-testid="seat-pod-0-sitting-out"');
  });

  it("renders state-specific copy for voluntary and waiting seats", () => {
    const html = renderToStaticMarkup(
      <Seats
        seats={[
          {
            id: 0,
            claimed: true,
            sittingOut: true,
            sittingOutReason: "voluntary",
            disconnected: false,
          },
          {
            id: 1,
            claimed: true,
            sittingOut: true,
            sittingOutReason: "waiting-for-next-hand",
            disconnected: false,
          },
        ]}
        view={null}
      />,
    );

    expect(html).toContain("Until you sit in");
    expect(html).toContain("Waiting for next hand");
    expect(html).toContain("Claimed after the deal");
  });

  it("shows a claimed seat absent from a live hand as sitting out", () => {
    const view: TableView = {
      phase: "betting",
      button: 0,
      smallBlind: 1,
      bigBlind: 2,
      dealtSeatCount: 3,
      street: "flop",
      board: [],
      toAct: [0],
      seats: [
        { seatId: 0, folded: false },
        { seatId: 1, folded: false },
      ],
    };
    const html = renderToStaticMarkup(
      <Seats
        seats={seats.map((seat) =>
          seat.id === 2
            ? { ...seat, sittingOutReason: "waiting-for-next-hand" as const }
            : seat,
        )}
        view={view}
      />,
    );

    expect(html).toMatch(
      /data-testid="seat-pod-2"[^>]*data-status="sitting-out"/,
    );
    expect(html).toMatch(
      /data-testid="seat-pod-2-sitting-out"[^>]*>[\s\S]*Waiting for next hand[\s\S]*Claimed after the deal[\s\S]*<\/div>/,
    );
    expect(html).toContain('data-testid="seat-pod-2-sitting-out-marker"');
    expect(html).not.toContain('data-testid="seat-pod-0-sitting-out"');
  });

  it("does not describe a disconnected seat as sitting out", () => {
    const view: TableView = {
      phase: "betting",
      button: 0,
      smallBlind: 1,
      bigBlind: 2,
      dealtSeatCount: 3,
      street: "flop",
      board: [],
      toAct: [0],
      seats: [{ seatId: 0, folded: false }],
    };
    const html = renderToStaticMarkup(
      <Seats
        seats={[
          {
            id: 0,
            claimed: true,
            sittingOut: false,
            sittingOutReason: null,
            disconnected: false,
          },
          {
            id: 1,
            claimed: true,
            sittingOut: false,
            sittingOutReason: null,
            disconnected: true,
          },
        ]}
        view={view}
      />,
    );

    expect(html).toMatch(
      /data-testid="seat-pod-1"[^>]*data-status="disconnected"/,
    );
    expect(html).not.toContain('data-testid="seat-pod-1-sitting-out"');
    expect(html).toContain('data-testid="seat-pod-1-disconnected"');
  });

  it("marks the button seat once a hand exists, even with no active betting", () => {
    const view: TableView = { phase: "no-hand", button: 1 };
    const html = renderToStaticMarkup(<Seats seats={seats} view={view} />);
    expect(html).toMatch(/data-testid="seat-pod-1"[^>]*data-button="true"/);
    expect(html).toMatch(/data-testid="seat-pod-0"[^>]*data-button="false"/);
  });

  it("marks status, button and the current actor during betting", () => {
    const view: TableView = {
      phase: "betting",
      button: 0,
      smallBlind: 1,
      bigBlind: 2,
      dealtSeatCount: 3,
      street: "flop",
      board: [],
      toAct: [1],
      seats: [
        { seatId: 0, folded: false },
        { seatId: 1, folded: false },
      ],
    };
    const html = renderToStaticMarkup(<Seats seats={seats} view={view} />);

    expect(html).toMatch(
      /data-testid="seat-pod-0"[^>]*data-status="in-hand"[^>]*data-button="true"/,
    );
    expect(html).toMatch(
      /data-testid="seat-pod-1"[^>]*data-status="in-hand"[^>]*data-turn="true"/,
    );
    expect(html).toContain('data-testid="seat-pod-1-to-act"');
    expect(html).not.toContain('data-testid="seat-pod-0-to-act"');
    expect(html).toMatch(
      /data-testid="seat-pod-2"[^>]*data-status="sitting-out"/,
    );
    expect(html).toMatch(/data-testid="seat-pod-3"[^>]*data-status="open"/);
  });

  it("marks a folded seat", () => {
    const view: TableView = {
      phase: "betting",
      button: 0,
      smallBlind: 1,
      bigBlind: 2,
      dealtSeatCount: 3,
      street: "preflop",
      board: [],
      toAct: [0],
      seats: [
        { seatId: 0, folded: false },
        { seatId: 1, folded: true },
      ],
    };
    const html = renderToStaticMarkup(
      <Seats seats={seats.slice(0, 2)} view={view} />,
    );
    expect(html).toMatch(/data-testid="seat-pod-1"[^>]*data-status="folded"/);
  });

  it("shows a disconnected badge for a presence-dropped seat", () => {
    const disconnectedSeats: SeatView[] = [
      {
        id: 0,
        claimed: true,
        sittingOut: false,
        sittingOutReason: null,
        disconnected: false,
      },
      {
        id: 1,
        claimed: true,
        sittingOut: false,
        sittingOutReason: null,
        disconnected: true,
      },
    ];
    const html = renderToStaticMarkup(
      <Seats seats={disconnectedSeats} view={null} />,
    );
    expect(html).toMatch(
      /data-testid="seat-pod-1"[^>]*data-disconnected="true"/,
    );
    expect(html).toContain('data-testid="seat-pod-1-disconnected"');
    expect(html).not.toContain('data-testid="seat-pod-0-disconnected"');
  });

  it("reveals nothing on the felt at showdown — no hole cards, hand, or winner mark", () => {
    // The reveal overlay (issue #169) owns who-won and every hand; the seat
    // pods stay plain so nothing shifts when the hand ends.
    const view: TableView = {
      phase: "showdown",
      button: 0,
      smallBlind: 1,
      bigBlind: 2,
      dealtSeatCount: 3,
      board: [
        { rank: "A", suit: "spades" },
        { rank: "K", suit: "hearts" },
        { rank: "2", suit: "clubs" },
        { rank: "7", suit: "diamonds" },
        { rank: "9", suit: "clubs" },
      ],
      winners: [0],
      results: [
        {
          seatId: 0,
          rank: 1,
          description: "Pair of Aces",
          holeCards: [
            { rank: "A", suit: "clubs" },
            { rank: "3", suit: "hearts" },
          ],
          bestHand: [
            { rank: "A", suit: "spades" },
            { rank: "A", suit: "clubs" },
            { rank: "K", suit: "hearts" },
            { rank: "9", suit: "clubs" },
            { rank: "7", suit: "diamonds" },
          ],
        },
      ],
    };
    const html = renderToStaticMarkup(<Seats seats={seats} view={view} />);
    expect(html).toMatch(/data-testid="seat-pod-0"[^>]*data-winner="false"/);
    expect(html).not.toContain("hole-cards");
    expect(html).not.toContain('data-testid="seat-pod-0-hand"');
    expect(html).not.toContain("Pair of Aces");
  });

  it("keeps a revealed player in-hand when they sit out for the next hand", () => {
    const view: TableView = {
      phase: "showdown",
      button: 0,
      smallBlind: 1,
      bigBlind: 2,
      dealtSeatCount: 3,
      board: [
        { rank: "A", suit: "spades" },
        { rank: "K", suit: "hearts" },
        { rank: "2", suit: "clubs" },
        { rank: "7", suit: "diamonds" },
        { rank: "9", suit: "clubs" },
      ],
      winners: [2],
      results: [
        {
          seatId: 2,
          rank: 1,
          description: "Pair of Aces",
          holeCards: [
            { rank: "A", suit: "clubs" },
            { rank: "3", suit: "hearts" },
          ],
          bestHand: [
            { rank: "A", suit: "spades" },
            { rank: "A", suit: "clubs" },
            { rank: "K", suit: "hearts" },
            { rank: "9", suit: "clubs" },
            { rank: "7", suit: "diamonds" },
          ],
        },
      ],
    };
    const html = renderToStaticMarkup(<Seats seats={seats} view={view} />);

    // Reaching showdown keeps the seat in-hand rather than sitting-out, even
    // though the felt no longer reveals its cards (the overlay does that).
    expect(html).toMatch(/data-testid="seat-pod-2"[^>]*data-status="in-hand"/);
    expect(html).not.toContain("hole-cards");
    expect(html).not.toContain('data-testid="seat-pod-2-sitting-out"');
    expect(html).not.toContain('data-testid="seat-pod-2-sitting-out-marker"');
    expect(html).not.toMatch(
      /data-testid="seat-pod-2-avatar"[^>]*style="[^"]*border:1px dashed/,
    );
    expect(html).toMatch(
      /data-testid="seat-pod-2-surface"[^>]*style="[^"]*opacity:1/,
    );
  });

  it("marks the sole winner at a fold-out completion, with no reveal", () => {
    const view: TableView = {
      phase: "folded-out",
      button: 0,
      smallBlind: 1,
      bigBlind: 2,
      dealtSeatCount: 3,
      winner: 1,
    };
    const sittingOutWinnerSeats = seats.map((seat) =>
      seat.id === 1 ? { ...seat, sittingOut: true } : seat,
    );
    const html = renderToStaticMarkup(
      <Seats seats={sittingOutWinnerSeats} view={view} />,
    );
    expect(html).toMatch(/data-testid="seat-pod-1"[^>]*data-winner="true"/);
    expect(html).toMatch(/data-testid="seat-pod-1"[^>]*data-status="in-hand"/);
    expect(html).toMatch(/data-testid="seat-pod-0"[^>]*data-winner="false"/);
    expect(html).not.toContain('data-testid="seat-pod-1-sitting-out"');
    expect(html).not.toContain('data-testid="seat-pod-1-sitting-out-marker"');
    expect(html).not.toContain("hole-cards");
  });

  it("flips a top-row seat's identity placard so that side of the table reads it upright", () => {
    // Four seats: 0 and 1 sit along the bottom edge, 2 and 3 along the top.
    const html = renderToStaticMarkup(
      <Seats
        seats={seats.map((seat) =>
          seat.id === 3
            ? { ...seat, claimed: true, displayName: "Nkechi-Amara" }
            : seat,
        )}
        view={null}
      />,
    );

    expect(html).toMatch(
      /data-testid="seat-pod-3-placard"[^>]*data-flipped="true"/,
    );
    expect(styleOf(html, "seat-pod-3-placard")).toContain(
      "transform:rotate(180deg)",
    );
    // The identity is one row rather than the bottom row's column, so a
    // top-row seat is only ever about an avatar deep however long the name.
    expect(styleOf(html, "seat-pod-3-placard")).toContain("flex-direction:row");
    expect(html).toMatch(
      /data-testid="seat-pod-3-placard"[\s\S]*data-testid="seat-pod-3-avatar"[\s\S]*data-testid="seat-pod-3-name"/,
    );
  });

  it("leaves a bottom-row seat unflipped, with no placard", () => {
    const html = renderToStaticMarkup(<Seats seats={seats} view={null} />);

    expect(html).not.toContain('data-testid="seat-pod-0-placard"');
    expect(html).not.toContain('data-testid="seat-pod-1-placard"');
    expect(styleOf(html, "seat-pod-0-surface")).not.toContain("rotate");
  });

  it("keeps the top-row action callout separate from the placard and upright", () => {
    const view: TableView = {
      phase: "betting",
      button: 0,
      smallBlind: 1,
      bigBlind: 3,
      dealtSeatCount: 3,
      street: "flop",
      board: [],
      toAct: [3],
      seats: [
        { seatId: 0, folded: false },
        { seatId: 1, folded: false },
        { seatId: 3, folded: false },
      ],
    };
    const html = renderToStaticMarkup(
      <Seats
        seats={seats.map((seat) =>
          seat.id === 3 ? { ...seat, claimed: true } : seat,
        )}
        view={view}
      />,
    );

    // The callout is a sibling of the placard, not a child of it, so it keeps
    // its own inward footprint while still reading upright from the top side.
    expect(subtreeOf(html, "seat-pod-3-placard")).not.toContain("To act");
    expect(html).toMatch(
      /data-testid="seat-pod-3-placard"[\s\S]*data-testid="seat-pod-3-to-act"/,
    );
    expect(styleOf(html, "seat-pod-3-to-act")).toContain("rotate(180deg)");
  });

  it("keeps a bottom-row action callout unrotated", () => {
    const view: TableView = {
      phase: "betting",
      button: 0,
      smallBlind: 1,
      bigBlind: 2,
      dealtSeatCount: 3,
      street: "flop",
      board: [],
      toAct: [1],
      seats: [
        { seatId: 0, folded: false },
        { seatId: 1, folded: false },
      ],
    };
    const html = renderToStaticMarkup(<Seats seats={seats} view={view} />);
    expect(styleOf(html, "seat-pod-1-to-act")).not.toContain("rotate(180deg)");
  });

  it("flips a top-row disconnected badge with the rest of that seat's copy", () => {
    const html = renderToStaticMarkup(
      <Seats
        seats={seats.map((seat) =>
          seat.id === 2 ? { ...seat, disconnected: true } : seat,
        )}
        view={null}
      />,
    );

    expect(html).toContain("Disconnected");
    expect(styleOf(html, "seat-pod-2-disconnected")).toContain(
      "transform:rotate(180deg)",
    );
  });

  it("keeps every seat state's copy inside the flipped top-row placard", () => {
    const html = renderToStaticMarkup(
      <Seats
        seats={seats.map((seat) =>
          seat.id === 2
            ? { ...seat, sittingOutReason: "waiting-for-next-hand" as const }
            : seat.id === 3
              ? {
                  ...seat,
                  claimed: true,
                  displayName: "Nkechi-Amara Oyelaran-Whitfield",
                }
              : seat,
        )}
        view={null}
      />,
    );

    // Seats 2 and 3 are the top row: one waiting for the next hand, one with
    // a name long enough to need the caption's existing 8em bound.
    const waiting = subtreeOf(html, "seat-pod-2-placard");
    expect(waiting).toContain("Waiting for next hand");
    expect(waiting).toContain("Claimed after the deal");
    expect(waiting).toContain('data-testid="seat-pod-2-sitting-out-marker"');

    const longName = subtreeOf(html, "seat-pod-3-placard");
    expect(longName).toContain("Nkechi-Amara Oyelaran-Whitfield");
    expect(styleOf(longName, "seat-pod-3-name")).toContain("max-width:8em");
    expect(styleOf(longName, "seat-pod-3-name")).toContain(
      "text-overflow:ellipsis",
    );
  });

  it("keeps a folded top-row seat dimmed behind its flipped placard", () => {
    const view: TableView = {
      phase: "betting",
      button: 0,
      smallBlind: 1,
      bigBlind: 2,
      dealtSeatCount: 3,
      street: "flop",
      board: [],
      toAct: [0],
      seats: [
        { seatId: 0, folded: false },
        { seatId: 2, folded: true },
      ],
    };
    const html = renderToStaticMarkup(<Seats seats={seats} view={view} />);

    expect(html).toMatch(/data-testid="seat-pod-2"[^>]*data-status="folded"/);
    // The fade still lives on the surface, outside the rotation, so a flipped
    // seat folds exactly as visibly as a bottom-row one.
    expect(styleOf(html, "seat-pod-2-surface")).toContain("opacity:0.34");
    expect(styleOf(html, "seat-pod-2-placard")).toContain(
      "transform:rotate(180deg)",
    );
  });

  it("marks only claimed seats as clickable when onSeatClick is provided (ADR-0003)", () => {
    const html = renderToStaticMarkup(
      <Seats seats={seats} view={null} onSeatClick={() => undefined} />,
    );
    expect(html).toMatch(
      /data-testid="seat-pod-0"[^>]*style="[^"]*cursor:pointer/,
    );
    expect(html).toMatch(
      /data-testid="seat-pod-3"[^>]*style="(?:(?!cursor).)*"/,
    );
  });
});

/**
 * The rendered markup of the `div` carrying `testid`, including its own tags —
 * enough to ask what is inside an element rather than merely near it, without
 * pinning a test to how deeply anything is nested.
 */
function subtreeOf(html: string, testid: string): string {
  const start = html.indexOf(`<div data-testid="${testid}"`);
  expect(start).toBeGreaterThanOrEqual(0);

  let depth = 0;
  for (const tag of html.slice(start).matchAll(/<(\/?)div\b[^>]*>/g)) {
    depth += tag[1] === "/" ? -1 : 1;
    if (depth === 0) {
      return html.slice(start, start + tag.index + tag[0].length);
    }
  }
  throw new Error(`unclosed element for ${testid}`);
}

/** The inline `style` attribute of the span carrying `testid`, if drawn. */
function styleOf(html: string, testid: string): string | null {
  const match = new RegExp(`data-testid="${testid}"[^>]*style="([^"]*)"`).exec(
    html,
  );
  return match?.[1] ?? null;
}

const threeHanded: TableView = {
  // Seats 3, 0 and 1 are in the hand with the button on 3, so ring order
  // (3 -> 0 -> 1) runs the opposite way to seat-number order.
  phase: "betting",
  button: 3,
  smallBlind: 0,
  bigBlind: 1,
  dealtSeatCount: 3,
  street: "preflop",
  board: [],
  toAct: [0],
  seats: [
    { seatId: 3, folded: false },
    { seatId: 0, folded: false },
    { seatId: 1, folded: false },
  ],
};

const headsUpPositions = {
  button: 0,
  smallBlind: 0,
  bigBlind: 1,
  dealtSeatCount: 2,
} as const;

describe("Seats: position markers", () => {
  it("draws all three markers, on the seats the view names", () => {
    const html = renderToStaticMarkup(
      <Seats seats={seats} view={threeHanded} />,
    );

    expect(html).toContain('data-testid="seat-pod-3-button"');
    expect(html).toContain('data-testid="seat-pod-0-small-blind"');
    expect(html).toContain('data-testid="seat-pod-1-big-blind"');
    expect(html).toMatch(
      /data-testid="seat-pod-0"[^>]*data-small-blind="true"/,
    );
    expect(html).toMatch(/data-testid="seat-pod-1"[^>]*data-big-blind="true"/);
  });

  it("follows ring order rather than seat-number order", () => {
    const html = renderToStaticMarkup(
      <Seats seats={seats} view={threeHanded} />,
    );

    // Seat 0 is the lowest seat number but sits button+1, so it is the small
    // blind — seat-number arithmetic from the button would have said seat 4.
    expect(html).not.toContain('data-testid="seat-pod-0-button"');
    expect(html).not.toContain('data-testid="seat-pod-3-small-blind"');
    expect(html).not.toContain('data-testid="seat-pod-0-big-blind"');
  });

  it("gives no seat more than one marker", () => {
    const html = renderToStaticMarkup(
      <Seats seats={seats} view={threeHanded} />,
    );
    const markers = html.match(
      /data-testid="seat-pod-\d+-(?:button|small-blind|big-blind)"/g,
    );
    expect(markers).toHaveLength(3);
    expect(new Set(markers).size).toBe(3);
  });

  it("draws the button only between hands", () => {
    const html = renderToStaticMarkup(
      <Seats seats={seats} view={{ phase: "no-hand", button: 1 }} />,
    );
    expect(html).toContain('data-testid="seat-pod-1-button"');
    expect(html).not.toContain('small-blind"');
    expect(html).not.toContain('big-blind"');
  });

  // Issue #160, decision 4: heads-up the button *is* the small blind, and the
  // client suppresses both blinds rather than doubling up a seat.
  it.each([
    [
      "betting",
      {
        ...headsUpPositions,
        phase: "betting",
        street: "preflop",
        board: [],
        toAct: [0],
        seats: [
          { seatId: 0, folded: false },
          { seatId: 1, folded: false },
        ],
      } satisfies TableView,
    ],
    [
      "showdown",
      {
        ...headsUpPositions,
        phase: "showdown",
        board: [],
        winners: [0],
        results: [],
      } satisfies TableView,
    ],
    [
      "folded-out",
      {
        ...headsUpPositions,
        phase: "folded-out",
        winner: 0,
      } satisfies TableView,
    ],
  ])("draws the button only in a heads-up hand (%s)", (_phase, view) => {
    const html = renderToStaticMarkup(<Seats seats={seats} view={view} />);

    expect(html).toContain('data-testid="seat-pod-0-button"');
    expect(html).not.toContain('data-testid="seat-pod-0-small-blind"');
    expect(html).not.toContain('data-testid="seat-pod-1-big-blind"');
    expect(html).toMatch(
      /data-testid="seat-pod-0"[^>]*data-small-blind="false"/,
    );
    expect(html).toMatch(/data-testid="seat-pod-1"[^>]*data-big-blind="false"/);
  });

  it("renders all three markers at one diameter and one font size", () => {
    const html = renderToStaticMarkup(
      <Seats seats={seats} view={threeHanded} />,
    );

    const sizes = [
      styleOf(html, "seat-pod-3-button"),
      styleOf(html, "seat-pod-0-small-blind"),
      styleOf(html, "seat-pod-1-big-blind"),
    ].map((style) => {
      expect(style).not.toBeNull();
      return /width:([^;]+);height:([^;]+);/.exec(style ?? "")?.slice(1, 3);
    });

    expect(sizes[0]).toBeDefined();
    expect(sizes[1]).toEqual(sizes[0]);
    expect(sizes[2]).toEqual(sizes[0]);
    // The label's font size lives on an inner span, so the diameter resolves
    // against the pod and not against the marker's own text.
    expect(sizes[0]?.[0]).toBe(sizes[0]?.[1]);

    const fontSizes = html.match(/font-size:0\.62em/g);
    expect(fontSizes).toHaveLength(3);
  });
});
