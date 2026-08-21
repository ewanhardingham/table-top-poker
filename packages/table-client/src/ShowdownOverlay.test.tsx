import type { SeatView, TableView } from "@table-top-poker/protocol";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ShowdownOverlay } from "./ShowdownOverlay.js";

type ShowdownView = Extract<TableView, { phase: "showdown" }>;

function seat(id: number, displayName?: string): SeatView {
  return {
    id,
    claimed: displayName !== undefined,
    ...(displayName !== undefined ? { displayName } : {}),
    sittingOut: false,
    sittingOutReason: null,
    disconnected: false,
  };
}

const seats: SeatView[] = [seat(0, "Mara"), seat(1, "Devin"), seat(2, "Priya")];

const showdown: ShowdownView = {
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
  contestants: [0, 1],
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
    {
      seatId: 1,
      rank: 2,
      description: "Ace high",
      holeCards: [
        { rank: "Q", suit: "diamonds" },
        { rank: "4", suit: "hearts" },
      ],
      bestHand: [
        { rank: "A", suit: "spades" },
        { rank: "K", suit: "hearts" },
        { rank: "Q", suit: "diamonds" },
        { rank: "9", suit: "clubs" },
        { rank: "7", suit: "diamonds" },
      ],
    },
  ],
};

function render(
  view: ShowdownView,
  props: Partial<React.ComponentProps<typeof ShowdownOverlay>> = {},
) {
  return renderToStaticMarkup(
    <ShowdownOverlay
      view={view}
      seats={seats}
      collapsed={false}
      canDealNextHand
      onNextHand={() => undefined}
      onViewTable={() => undefined}
      {...props}
    />,
  );
}

describe("ShowdownOverlay", () => {
  it("shows the board and every revealed seat's name, cards, and hand", () => {
    const html = render(showdown);

    expect(html).toContain('data-testid="showdown-overlay"');
    expect(html).toContain('data-testid="showdown-board"');
    expect(html).toContain('data-testid="showdown-player-0"');
    expect(html).toContain('data-testid="showdown-player-1"');
    expect(html).toContain("Mara");
    expect(html).toContain("Pair of Aces");
    expect(html).toContain("Devin");
    expect(html).toContain("Ace high");
    expect((html.match(/data-face-down="false"/g) ?? []).length).toBe(9);
  });

  it("features the winner and leaves the loser unmarked", () => {
    const html = render(showdown);

    expect(html).toMatch(
      /data-testid="showdown-player-0"[^>]*data-winner="true"/,
    );
    expect(html).toMatch(
      /data-testid="showdown-player-1"[^>]*data-winner="false"/,
    );
    expect(html).toContain("WINS");
  });

  it("features every winner on a split pot", () => {
    const split: ShowdownView = {
      ...showdown,
      winners: [0, 1],
      results: showdown.results.map((result) => ({
        ...result,
        rank: 1,
        description: "Pair of Aces",
      })),
    };
    const html = render(split);

    expect(html).toMatch(
      /data-testid="showdown-player-0"[^>]*data-winner="true"/,
    );
    expect(html).toMatch(
      /data-testid="showdown-player-1"[^>]*data-winner="true"/,
    );
  });

  it("falls back to a seat number when a revealed seat has no display name", () => {
    const html = renderToStaticMarkup(
      <ShowdownOverlay
        view={showdown}
        seats={[seat(1, "Devin")]}
        collapsed={false}
        canDealNextHand
        onNextHand={() => undefined}
        onViewTable={() => undefined}
      />,
    );

    expect(html).toContain("Seat 1");
  });

  it("disables Next hand with the standing hint below two eligible seats", () => {
    const html = render(showdown, { canDealNextHand: false });

    expect(html).toMatch(
      /data-testid="showdown-next-hand-button"[^>]*disabled/,
    );
    expect(html).toContain('data-testid="showdown-next-hand-blocked-hint"');
    expect(html).toContain("Waiting for at least two players");
  });

  it("keeps Next hand live and unblocked when two seats are eligible", () => {
    const html = render(showdown);

    expect(html).not.toMatch(
      /data-testid="showdown-next-hand-button"[^>]*disabled/,
    );
    expect(html).not.toContain('data-testid="showdown-next-hand-blocked-hint"');
  });

  it("renders nothing when collapsed — the rail reopens it", () => {
    const html = render(showdown, { collapsed: true });

    expect(html).not.toContain('data-testid="showdown-overlay"');
    expect(html).not.toContain('data-testid="showdown-next-hand-button"');
  });
});
