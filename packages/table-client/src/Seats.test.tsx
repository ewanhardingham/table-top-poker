import type { SeatView, TableView } from "@table-top-poker/protocol";
import { color } from "@table-top-poker/ui-shared";
/* eslint-disable @typescript-eslint/no-deprecated -- React 19's DOM-free component test renderer is deprecated but remains the available interaction harness here. */
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { act, create } from "react-test-renderer";
import { describe, expect, it, vi } from "vitest";
import { Seats } from "./Seats.js";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

interface StoppableClickNode {
  readonly props: {
    readonly onClick?: (event: { stopPropagation: () => void }) => void;
  };
}

interface ClickableTree {
  readonly root: {
    findByProps(props: Record<string, unknown>): StoppableClickNode;
  };
}

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

  it("shows a visible bot marker only on bot seats", () => {
    const first = seats[0];
    const second = seats[1];
    if (first === undefined || second === undefined) {
      throw new Error("expected two seats");
    }
    const html = renderToStaticMarkup(
      <Seats seats={[{ ...first, bot: true }, second]} view={null} />,
    );

    expect(html).toMatch(/data-testid="seat-pod-0"[^>]*data-bot="true"/);
    expect(html).toContain('data-testid="seat-pod-0-bot-marker"');
    expect(html).toContain("🤖");
    expect(html).toMatch(/data-testid="seat-pod-1"[^>]*data-bot="false"/);
    expect(html).not.toContain('data-testid="seat-pod-1-bot-marker"');
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
      tabled: [],
      turnEndsAt: null,
      button: 0,
      smallBlind: 1,
      bigBlind: 2,
      dealtSeatCount: 3,
      burnedCount: 0,
      street: "flop",
      board: [],
      toAct: [0],
      seats: [
        { seatId: 0, folded: false, allIn: false },
        { seatId: 1, folded: false, allIn: false },
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
      tabled: [],
      turnEndsAt: null,
      button: 0,
      smallBlind: 1,
      bigBlind: 2,
      dealtSeatCount: 3,
      burnedCount: 0,
      street: "flop",
      board: [],
      toAct: [0],
      seats: [{ seatId: 0, folded: false, allIn: false }],
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
      tabled: [],
      turnEndsAt: null,
      button: 0,
      smallBlind: 1,
      bigBlind: 2,
      dealtSeatCount: 3,
      burnedCount: 0,
      street: "flop",
      board: [],
      toAct: [1],
      seats: [
        { seatId: 0, folded: false, allIn: false },
        { seatId: 1, folded: false, allIn: false },
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

  it("renders the active seat's number countdown below its position marker", () => {
    const html = renderToStaticMarkup(
      <Seats
        seats={seats}
        view={{ ...threeHanded, turnEndsAt: Date.now() + 30_000 }}
      />,
    );

    expect(html).toContain('data-testid="seat-shot-clock"');
    expect(html).toContain(">30</span>");
    expect((html.match(/data-testid="seat-shot-clock"/g) ?? []).length).toBe(1);
    expect(styleOf(html, "seat-shot-clock")).toContain("bottom:-0.5em");
    expect(styleOf(html, "seat-pod-0-small-blind")).toContain("top:-0.4em");
  });

  it("marks a folded seat", () => {
    const view: TableView = {
      phase: "betting",
      tabled: [],
      turnEndsAt: null,
      button: 0,
      smallBlind: 1,
      bigBlind: 2,
      dealtSeatCount: 3,
      burnedCount: 0,
      street: "preflop",
      board: [],
      toAct: [0],
      seats: [
        { seatId: 0, folded: false, allIn: false },
        { seatId: 1, folded: true, allIn: false },
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

  it("tables a shown hand on the seat plate with its rank badge, naming no hand", () => {
    const view: TableView = {
      phase: "showdown",
      turnEndsAt: null,
      queue: [],
      mucked: [],
      button: 0,
      smallBlind: 1,
      bigBlind: 2,
      dealtSeatCount: 3,
      burnedCount: 0,
      board: [
        { rank: "A", suit: "spades" },
        { rank: "K", suit: "hearts" },
        { rank: "2", suit: "clubs" },
        { rank: "7", suit: "diamonds" },
        { rank: "9", suit: "clubs" },
      ],
      contestants: [0],
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
    expect(html).toContain('data-testid="seat-pod-0-showdown"');
    expect(html).toContain("wins");
    expect(html).not.toContain("Pair of Aces");
    expect(html).not.toContain('data-testid="seat-pod-1-showdown"');
  });

  it("keeps a revealed player in-hand when they sit out for the next hand", () => {
    const view: TableView = {
      phase: "showdown",
      turnEndsAt: null,
      queue: [],
      mucked: [],
      button: 0,
      smallBlind: 1,
      bigBlind: 2,
      dealtSeatCount: 3,
      burnedCount: 0,
      board: [
        { rank: "A", suit: "spades" },
        { rank: "K", suit: "hearts" },
        { rank: "2", suit: "clubs" },
        { rank: "7", suit: "diamonds" },
        { rank: "9", suit: "clubs" },
      ],
      contestants: [2],
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
      burnedCount: 0,
      board: [],
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
    expect(styleOf(html, "seat-pod-3-placard")).toContain("flex-direction:row");
    expect(html).toMatch(
      /data-testid="seat-pod-3-placard"[\s\S]*data-testid="seat-pod-3-avatar"[\s\S]*data-testid="seat-pod-3-name"/,
    );
  });

  it("gives a bottom-row seat the same placard, unflipped", () => {
    const html = renderToStaticMarkup(
      <Seats
        seats={seats.map((seat) =>
          seat.id === 0 ? { ...seat, displayName: "Avery" } : seat,
        )}
        view={null}
      />,
    );

    expect(html).toMatch(
      /data-testid="seat-pod-0-placard"[^>]*data-flipped="false"/,
    );
    expect(styleOf(html, "seat-pod-0-placard")).toContain("flex-direction:row");
    expect(styleOf(html, "seat-pod-0-placard")).not.toContain("rotate");
    expect(html).toMatch(
      /data-testid="seat-pod-0-placard"[\s\S]*data-testid="seat-pod-0-avatar"[\s\S]*data-testid="seat-pod-0-name"/,
    );
  });

  it("keeps the top-row action callout separate from the placard and upright", () => {
    const view: TableView = {
      phase: "betting",
      tabled: [],
      turnEndsAt: null,
      button: 0,
      smallBlind: 1,
      bigBlind: 3,
      dealtSeatCount: 3,
      burnedCount: 0,
      street: "flop",
      board: [],
      toAct: [3],
      seats: [
        { seatId: 0, folded: false, allIn: false },
        { seatId: 1, folded: false, allIn: false },
        { seatId: 3, folded: false, allIn: false },
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

    expect(subtreeOf(html, "seat-pod-3-placard")).not.toContain("To act");
    expect(html).toMatch(
      /data-testid="seat-pod-3-placard"[\s\S]*data-testid="seat-pod-3-to-act"/,
    );
    expect(styleOf(html, "seat-pod-3-to-act")).toContain("rotate(180deg)");
  });

  it("keeps a bottom-row action callout unrotated", () => {
    const view: TableView = {
      phase: "betting",
      tabled: [],
      turnEndsAt: null,
      button: 0,
      smallBlind: 1,
      bigBlind: 2,
      dealtSeatCount: 3,
      burnedCount: 0,
      street: "flop",
      board: [],
      toAct: [1],
      seats: [
        { seatId: 0, folded: false, allIn: false },
        { seatId: 1, folded: false, allIn: false },
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
      tabled: [],
      turnEndsAt: null,
      button: 0,
      smallBlind: 1,
      bigBlind: 2,
      dealtSeatCount: 3,
      burnedCount: 0,
      street: "flop",
      board: [],
      toAct: [0],
      seats: [
        { seatId: 0, folded: false, allIn: false },
        { seatId: 2, folded: true, allIn: false },
      ],
    };
    const html = renderToStaticMarkup(<Seats seats={seats} view={view} />);

    expect(html).toMatch(/data-testid="seat-pod-2"[^>]*data-status="folded"/);
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

function styleOf(html: string, testid: string): string | null {
  const match = new RegExp(`data-testid="${testid}"[^>]*style="([^"]*)"`).exec(
    html,
  );
  return match?.[1] ?? null;
}

const threeHanded: Extract<TableView, { phase: "betting" }> = {
  phase: "betting",
  tabled: [],
  turnEndsAt: null,
  button: 3,
  smallBlind: 0,
  bigBlind: 1,
  dealtSeatCount: 3,
  burnedCount: 0,
  street: "preflop",
  board: [],
  toAct: [0],
  seats: [
    { seatId: 3, folded: false, allIn: false },
    { seatId: 0, folded: false, allIn: false },
    { seatId: 1, folded: false, allIn: false },
  ],
};

const headsUpPositions = {
  turnEndsAt: null,
  button: 0,
  smallBlind: 0,
  bigBlind: 1,
  dealtSeatCount: 2,
  burnedCount: 0,
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

  it.each([
    [
      "betting",
      {
        ...headsUpPositions,
        phase: "betting",
        tabled: [],
        street: "preflop",
        board: [],
        toAct: [0],
        seats: [
          { seatId: 0, folded: false, allIn: false },
          { seatId: 1, folded: false, allIn: false },
        ],
      } satisfies TableView,
    ],
    [
      "showdown",
      {
        ...headsUpPositions,
        phase: "showdown",
        turnEndsAt: null,
        queue: [],
        mucked: [],
        board: [],
        contestants: [0, 1],
        winners: [0],
        results: [],
      } satisfies TableView,
    ],
    [
      "folded-out",
      {
        ...headsUpPositions,
        phase: "folded-out",
        board: [],
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
    expect(sizes[0]?.[0]).toBe(sizes[0]?.[1]);

    const fontSizes = html.match(/font-size:0\.62em/g);
    expect(fontSizes).toHaveLength(3);
  });
});

describe("Seats: action labels", () => {
  const labels = new Map<number, "fold" | "check" | "call" | "raise">([
    [3, "raise"],
    [1, "call"],
  ]);

  it("shows a pill for each seat that has acted", () => {
    const html = renderToStaticMarkup(
      <Seats seats={seats} view={threeHanded} actionLabels={labels} />,
    );

    expect(html).toMatch(
      /data-testid="seat-pod-3-action"[^>]*data-action="raise"/,
    );
    expect(html).toContain("raised");
    expect(html).toMatch(
      /data-testid="seat-pod-1-action"[^>]*data-action="call"/,
    );
    expect(html).toContain("called");
  });

  it("leaves the seats that have not acted bare", () => {
    const html = renderToStaticMarkup(
      <Seats seats={seats} view={threeHanded} actionLabels={labels} />,
    );

    expect(html).not.toContain('data-testid="seat-pod-2-action"');
  });

  it("yields the slot to the seat on the clock", () => {
    const html = renderToStaticMarkup(
      <Seats
        seats={seats}
        view={threeHanded}
        actionLabels={new Map([[0, "call" as const]])}
      />,
    );

    expect(html).toContain('data-testid="seat-pod-0-to-act"');
    expect(html).not.toContain('data-testid="seat-pod-0-action"');
  });

  it("keeps accent red for the clock alone, and paints raise orange", () => {
    const html = renderToStaticMarkup(
      <Seats seats={seats} view={threeHanded} actionLabels={labels} />,
    );

    const raise = styleOf(html, "seat-pod-3-action") ?? "";
    const toAct = styleOf(html, "seat-pod-0-to-act") ?? "";

    expect(raise).not.toBe("");
    expect(toAct).toContain(color.accent);
    expect(raise).not.toContain(color.accent);
    expect(raise).toContain(color.actionRaise);
  });

  it("gives call the one cool fill on a warm felt", () => {
    const html = renderToStaticMarkup(
      <Seats seats={seats} view={threeHanded} actionLabels={labels} />,
    );

    const call = styleOf(html, "seat-pod-1-action") ?? "";

    expect(call).toContain(color.actionCall);
    expect(call).not.toContain(color.actionRaise);
  });

  it("flips a top-row pill with its pod", () => {
    const html = renderToStaticMarkup(
      <Seats seats={seats} view={threeHanded} actionLabels={labels} />,
    );

    expect(styleOf(html, "seat-pod-3-action")).toContain("rotate(180deg)");
  });
});

describe("Seats through a run-out", () => {
  const runOut: TableView & { phase: "betting" } = {
    phase: "betting",
    turnEndsAt: null,
    button: 0,
    smallBlind: 1,
    bigBlind: 2,
    dealtSeatCount: 3,
    burnedCount: 0,
    street: "flop",
    board: [
      { rank: "A", suit: "spades" },
      { rank: "K", suit: "hearts" },
      { rank: "2", suit: "clubs" },
    ],
    toAct: [],
    seats: [
      { seatId: 0, folded: false, allIn: true },
      { seatId: 1, folded: false, allIn: true },
      { seatId: 2, folded: true, allIn: false },
    ],
    tabled: [
      {
        seatId: 0,
        holeCards: [
          { rank: "A", suit: "clubs" },
          { rank: "3", suit: "hearts" },
        ],
      },
      {
        seatId: 1,
        holeCards: [
          { rank: "Q", suit: "spades" },
          { rank: "Q", suit: "diamonds" },
        ],
      },
    ],
  };

  it("lays every tabled hand face-up while the streets are still coming", () => {
    const html = renderToStaticMarkup(<Seats seats={seats} view={runOut} />);

    for (const seatId of [0, 1]) {
      expect(html).toMatch(
        new RegExp(
          `data-testid="seat-pod-${String(seatId)}-showdown"[^>]*data-shown="true"`,
        ),
      );
      for (const index of [0, 1]) {
        expect(
          subtreeOf(
            html,
            `seat-pod-${String(seatId)}-showdown-card-${String(index)}`,
          ),
        ).toContain('data-face-down="false"');
      }
    }
  });

  it("lays nothing on the felt for a seat that has folded", () => {
    const html = renderToStaticMarkup(<Seats seats={seats} view={runOut} />);

    expect(html).not.toContain('data-testid="seat-pod-2-showdown"');
  });

  it("badges no outcome before the hand is over", () => {
    const html = renderToStaticMarkup(<Seats seats={seats} view={runOut} />);

    expect(html).not.toContain('data-testid="seat-pod-0-showdown-badges"');
    expect(html).not.toContain("wins");
  });
});

describe("Seats at showdown", () => {
  const board: TableView & { phase: "showdown" } = {
    phase: "showdown",
    turnEndsAt: null,
    queue: [],
    mucked: [],
    button: 0,
    smallBlind: 1,
    bigBlind: 2,
    dealtSeatCount: 4,
    burnedCount: 0,
    board: [
      { rank: "A", suit: "spades" },
      { rank: "K", suit: "hearts" },
      { rank: "2", suit: "clubs" },
      { rank: "7", suit: "diamonds" },
      { rank: "9", suit: "clubs" },
    ],
    contestants: [0, 1],
    winners: null,
    results: [],
  };

  function shown(seatId: number, rank: number, description: string) {
    return {
      seatId,
      rank,
      description,
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
    } as const;
  }

  it("fans two backs for a contestant who has not shown", () => {
    const html = renderToStaticMarkup(<Seats seats={seats} view={board} />);

    expect(html).toMatch(
      /data-testid="seat-pod-0-showdown"[^>]*data-shown="false"/,
    );
    expect(subtreeOf(html, "seat-pod-0-showdown-card-0")).toContain(
      'data-face-down="true"',
    );
    expect(subtreeOf(html, "seat-pod-0-showdown-card-1")).toContain(
      'data-face-down="true"',
    );
    expect(html).not.toContain('data-testid="seat-pod-0-showdown-badges"');
  });

  it("lays nothing on the felt for a seat that never reached showdown", () => {
    const html = renderToStaticMarkup(<Seats seats={seats} view={board} />);

    expect(html).not.toContain('data-testid="seat-pod-2-showdown"');
    expect(html).not.toContain('data-testid="seat-pod-3-showdown"');
  });

  it("keeps a concealing seat in the hand it played", () => {
    const html = renderToStaticMarkup(
      <Seats
        seats={seats}
        view={{
          ...board,
          winners: [0],
          results: [shown(0, 30, "Pair of Aces")],
        }}
      />,
    );

    expect(html).toMatch(/data-testid="seat-pod-1"[^>]*data-status="in-hand"/);
    expect(html).toMatch(
      /data-testid="seat-pod-1-showdown"[^>]*data-shown="false"/,
    );
    expect(styleOf(html, "seat-pod-1-surface")).toContain(
      color.seatTabledBackground,
    );
  });

  it("calls a split without placing the hands that made it", () => {
    const html = renderToStaticMarkup(
      <Seats
        seats={seats}
        view={{
          ...board,
          contestants: [0, 1, 2],
          winners: [0, 1],
          results: [
            shown(0, 30, "Pair of Aces"),
            shown(1, 30, "Pair of Aces"),
            shown(2, 10, "Ace high"),
          ],
        }}
      />,
    );

    expect(html).toContain("splits");
    expect(html).not.toContain("Pair of Aces");
    expect(html).not.toContain("Ace high");
    expect(html).toContain('data-testid="seat-pod-0-showdown-verdict"');
    expect(html).toContain('data-testid="seat-pod-1-showdown-verdict"');
    expect(html).not.toContain('data-testid="seat-pod-2-showdown-badges"');
  });

  it("withholds the verdict from a winner who has not shown — the cards carry it", () => {
    const html = renderToStaticMarkup(
      <Seats
        seats={seats}
        view={{
          ...board,
          contestants: [0, 1],
          winners: [1],
          results: [shown(0, 30, "Pair of Aces")],
        }}
      />,
    );

    expect(html).toMatch(
      /data-testid="seat-pod-1-showdown"[^>]*data-shown="false"/,
    );
    expect(html).not.toContain("wins");
    expect(html).not.toContain('data-testid="seat-pod-1-showdown-verdict"');
  });

  it("names the winner as soon as they show", () => {
    const html = renderToStaticMarkup(
      <Seats
        seats={seats}
        view={{
          ...board,
          contestants: [0, 1],
          winners: [1],
          results: [shown(0, 10, "Ace high"), shown(1, 30, "Pair of Aces")],
        }}
      />,
    );

    expect(html).toContain("wins");
    expect(html).toContain('data-testid="seat-pod-1-showdown-verdict"');
    expect(html).not.toContain('data-testid="seat-pod-0-showdown-verdict"');
  });

  it("never spells out the hand a seat made — the cards are the result", () => {
    const html = renderToStaticMarkup(
      <Seats
        seats={seats}
        view={{
          ...board,
          winners: [0],
          results: [
            shown(0, 30, "Straight flush, king high"),
            shown(1, 10, "Ace high"),
          ],
        }}
      />,
    );

    expect(html).not.toContain("Straight flush");
    expect(html).not.toContain("Ace high");
    expect(html).toContain('data-testid="seat-pod-0-showdown-verdict"');
    expect(html).not.toContain('data-testid="seat-pod-1-showdown-badges"');
  });

  it("keeps a tap on a tabled hand out of the seat menu", () => {
    const onSeatClick = vi.fn();
    const view = {
      ...board,
      winners: [0],
      results: [shown(0, 30, "Pair of Aces")],
    };
    let renderer!: ClickableTree;
    act(() => {
      renderer = create(
        <Seats seats={seats} view={view} onSeatClick={onSeatClick} />,
      );
    });

    const stopPropagation = vi.fn();
    act(() => {
      renderer.root
        .findByProps({ "data-testid": "seat-pod-0-showdown" })
        .props.onClick?.({ stopPropagation });
    });

    expect(stopPropagation).toHaveBeenCalled();
    expect(onSeatClick).not.toHaveBeenCalled();
  });

  it("fills the plate opaque when a tabled hand sits behind it", () => {
    const view = {
      ...board,
      winners: [0],
      results: [shown(0, 30, "Pair of Aces")],
    };
    const html = renderToStaticMarkup(<Seats seats={seats} view={view} />);

    expect(styleOf(html, "seat-pod-1-surface")).toContain(
      color.seatTabledBackground,
    );
    expect(styleOf(html, "seat-pod-2-surface")).not.toContain(
      color.seatTabledBackground,
    );
  });

  it("tucks each tabled hand behind its plate, fanning toward the centre", () => {
    const view = {
      ...board,
      contestants: [0, 3],
      winners: [0],
      results: [shown(0, 30, "Pair of Aces"), shown(3, 10, "Ace high")],
    };
    const html = renderToStaticMarkup(<Seats seats={seats} view={view} />);

    expect(styleOf(html, "seat-pod-0-showdown")).toContain("bottom:8%");
    expect(styleOf(html, "seat-pod-3-showdown")).toContain("top:8%");
  });

  it("stacks the fan so neither card buries the other's corner index", () => {
    const view = {
      ...board,
      contestants: [0, 3],
      winners: [0],
      results: [shown(0, 30, "Pair of Aces"), shown(3, 10, "Ace high")],
    };
    const html = renderToStaticMarkup(<Seats seats={seats} view={view} />);

    expect(styleOf(html, "seat-pod-0-showdown-card-1")).toContain("z-index:1");
    expect(styleOf(html, "seat-pod-3-showdown-card-0")).toContain("z-index:1");
  });

  it("places no hand, shown or not, at a showdown", () => {
    const html = renderToStaticMarkup(
      <Seats
        seats={seats}
        view={{
          ...board,
          contestants: [0, 1, 2],
          winners: [2],
          results: [
            shown(0, 30, "Pair of Aces"),
            shown(1, 10, "Ace high"),
            shown(2, 40, "Two pair"),
          ],
        }}
      />,
    );

    expect(html).not.toContain("showdown-rank");
    expect(html).not.toContain("1st");
    expect(html).not.toContain("2nd");
    expect(html).toContain('data-testid="seat-pod-2-showdown-verdict"');
  });

  it("badges no one until the winners are declared", () => {
    const html = renderToStaticMarkup(
      <Seats
        seats={seats}
        view={{
          ...board,
          contestants: [0, 1],
          winners: null,
          results: [shown(0, 30, "Pair of Aces")],
        }}
      />,
    );

    expect(html).toContain('data-testid="seat-pod-0-showdown"');
    expect(html).not.toContain("showdown-badges");
    expect(html).not.toContain("wins");
  });

  it("flips a top-row seat's showdown badges with the rest of its plate", () => {
    const html = renderToStaticMarkup(
      <Seats
        seats={seats}
        view={{
          ...board,
          contestants: [0, 3],
          winners: [0, 3],
          results: [shown(0, 30, "Pair of Aces"), shown(3, 30, "Pair of Aces")],
        }}
      />,
    );

    expect(styleOf(html, "seat-pod-3-showdown-badges")).toContain(
      "transform:rotate(180deg)",
    );
    expect(styleOf(html, "seat-pod-3-surface")).toContain(
      "flex-direction:row-reverse",
    );
    expect(styleOf(html, "seat-pod-0-showdown-badges")).not.toContain("rotate");
    expect(styleOf(html, "seat-pod-0-surface")).toContain("flex-direction:row");
  });

  it("leaves no seat glowing to act once the hand has finished", () => {
    const html = renderToStaticMarkup(
      <Seats
        seats={seats}
        view={{
          ...board,
          winners: [0],
          results: [shown(0, 30, "Pair of Aces")],
        }}
      />,
    );

    expect(html).not.toContain("seat-actor-glow");
  });
});

describe("Seats to-act glow", () => {
  it("glows only the seat that is to act", () => {
    const view: TableView = {
      phase: "betting",
      tabled: [],
      turnEndsAt: null,
      button: 0,
      smallBlind: 1,
      bigBlind: 2,
      dealtSeatCount: 3,
      burnedCount: 0,
      street: "flop",
      board: [],
      toAct: [1],
      seats: [
        { seatId: 0, folded: false, allIn: false },
        { seatId: 1, folded: false, allIn: false },
      ],
    };
    const html = renderToStaticMarkup(<Seats seats={seats} view={view} />);

    expect(html).toMatch(
      /data-testid="seat-pod-1-surface"[^>]*class="seat-actor-glow"/,
    );
    expect(html).not.toMatch(
      /data-testid="seat-pod-0-surface"[^>]*class="seat-actor-glow"/,
    );
  });
});

describe("Seats through the showing window", () => {
  const window: TableView & { phase: "showdown" } = {
    phase: "showdown",
    turnEndsAt: Date.now() + 2000,
    queue: [1],
    mucked: [0],
    button: 0,
    smallBlind: 1,
    bigBlind: 2,
    dealtSeatCount: 2,
    burnedCount: 0,
    board: [],
    contestants: [0, 1],
    winners: null,
    results: [],
  };

  const twoSeats = [
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
  ] as const;

  it("lays nothing down for a mucked seat, and card backs for one still to act", () => {
    const html = renderToStaticMarkup(
      <Seats seats={[...twoSeats]} view={window} />,
    );

    expect(html).not.toContain('data-testid="seat-pod-0-showdown-card-0"');
    expect(html).toContain('data-testid="seat-pod-1-showdown-card-0"');
  });

  it("gives the head of the queue the betting turn's active treatment", () => {
    const html = renderToStaticMarkup(
      <Seats seats={[...twoSeats]} view={window} />,
    );

    expect(html).toMatch(/data-testid="seat-pod-1"[^>]*data-turn="true"/);
    expect(html).toMatch(/data-testid="seat-pod-0"[^>]*data-turn="false"/);
    expect(html).toContain('data-testid="seat-pod-1-to-act"');
  });

  it("holds the seat-plate clock back until the closing seconds", () => {
    const early = renderToStaticMarkup(
      <Seats
        seats={[...twoSeats]}
        view={{ ...window, turnEndsAt: Date.now() + 25_000 }}
        showdownClockSeconds={30}
      />,
    );
    expect(early).not.toContain('data-testid="seat-showdown-clock"');

    const closing = renderToStaticMarkup(
      <Seats
        seats={[...twoSeats]}
        view={{ ...window, turnEndsAt: Date.now() + 2000 }}
        showdownClockSeconds={30}
      />,
    );
    expect(closing).toContain('data-testid="seat-showdown-clock"');
  });

  it("drops the active treatment once the verdict lands", () => {
    const html = renderToStaticMarkup(
      <Seats
        seats={[...twoSeats]}
        view={{ ...window, winners: [1], queue: [] }}
      />,
    );

    expect(html).toMatch(/data-testid="seat-pod-1"[^>]*data-turn="false"/);
  });
});
