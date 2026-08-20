import type { Card, HandSummary, SeatView } from "@table-top-poker/protocol";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
/* eslint-disable @typescript-eslint/no-deprecated -- React 19's DOM-free component test renderer is deprecated but remains the available interaction harness here. */
import { act, create } from "react-test-renderer";
import { describe, expect, it, vi } from "vitest";
import { HandPicker } from "./HandPicker.js";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

// The relative start-time label re-ticks on an interval; these tests render
// in Node, which has no `window` to hang it off.
vi.stubGlobal("window", {
  setInterval: () => 0,
  clearInterval: () => undefined,
});

const noop = () => undefined;

function card(rank: Card["rank"], suit: Card["suit"]): Card {
  return { rank, suit };
}

function seat(id: number, displayName: string | null = null): SeatView {
  return {
    id,
    claimed: true,
    sittingOut: false,
    sittingOutReason: null,
    disconnected: false,
    ...(displayName !== null && { displayName }),
  };
}

const foldedOutWalk: HandSummary = {
  handOrdinal: 1,
  startedAt: new Date(Date.now() - 90_000).toISOString(),
  button: 0,
  seatsDealtIn: [0, 1],
  survivors: [1],
  board: [],
  streetReached: "preflop",
  bettingShape: { kind: "walk" },
  outcome: { kind: "folded-out", winner: 1 },
};

const raiseWarToTurn: HandSummary = {
  handOrdinal: 2,
  startedAt: new Date(Date.now() - 5_000).toISOString(),
  button: 1,
  seatsDealtIn: [0, 1, 2],
  survivors: [0, 2],
  board: [card("2", "clubs"), card("7", "hearts"), card("K", "spades")],
  streetReached: "turn",
  bettingShape: { kind: "raise-war", raises: 4 },
  outcome: { kind: "folded-out", winner: 2 },
};

const showdown: HandSummary = {
  handOrdinal: 3,
  startedAt: new Date(Date.now() - 10_000).toISOString(),
  button: 0,
  seatsDealtIn: [0, 1],
  survivors: [0, 1],
  board: [
    card("2", "clubs"),
    card("7", "hearts"),
    card("K", "spades"),
    card("9", "diamonds"),
    card("A", "clubs"),
  ],
  streetReached: "river",
  bettingShape: { kind: "one-raise" },
  outcome: {
    kind: "showdown",
    winners: [0],
    reveals: [
      {
        seatId: 0,
        bestHand: [
          card("A", "clubs"),
          card("A", "spades"),
          card("K", "spades"),
          card("9", "diamonds"),
          card("7", "hearts"),
        ],
        description: "Pair of aces",
      },
      {
        seatId: 1,
        bestHand: [
          card("2", "hearts"),
          card("2", "diamonds"),
          card("K", "spades"),
          card("9", "diamonds"),
          card("7", "hearts"),
        ],
        description: "Pair of twos",
      },
    ],
  },
};

describe("HandPicker", () => {
  it("lists hands newest-first with ordinal, betting shape, and outcome", () => {
    const html = renderToStaticMarkup(
      <HandPicker
        summaries={[foldedOutWalk, raiseWarToTurn]}
        seats={[seat(0), seat(1), seat(2)]}
        onSelectHand={noop}
        onClose={noop}
      />,
    );
    const firstRow = html.indexOf('data-testid="hand-row-2"');
    const secondRow = html.indexOf('data-testid="hand-row-1"');
    expect(firstRow).toBeGreaterThan(-1);
    expect(secondRow).toBeGreaterThan(firstRow);
    expect(html).toContain("raise war — 4 raises");
    expect(html).toContain("walk — folded round");
    expect(html).toContain("2 to the turn");
    expect(html).toContain("1 to preflop");
  });

  it("shows dashed empty slots for undealt streets", () => {
    const html = renderToStaticMarkup(
      <HandPicker
        summaries={[foldedOutWalk]}
        seats={[seat(0), seat(1)]}
        onSelectHand={noop}
        onClose={noop}
      />,
    );
    const dashedSlots = html.match(/border:1px dashed/g) ?? [];
    expect(dashedSlots).toHaveLength(5);
  });

  it("shows the fold-out winner by seat and hides the showdown wording", () => {
    const html = renderToStaticMarkup(
      <HandPicker
        summaries={[foldedOutWalk]}
        seats={[seat(0), seat(1)]}
        onSelectHand={noop}
        onClose={noop}
      />,
    );
    expect(html).toContain("Seat 2 wins — everyone folded");
  });

  it("shows the showdown winner's hand description", () => {
    const html = renderToStaticMarkup(
      <HandPicker
        summaries={[showdown]}
        seats={[seat(0), seat(1)]}
        onSelectHand={noop}
        onClose={noop}
      />,
    );
    expect(html).toContain("Seat 1 wins — Pair of aces");
  });

  it("shows an empty state when no hands have completed", () => {
    const html = renderToStaticMarkup(
      <HandPicker
        summaries={[]}
        seats={[]}
        onSelectHand={noop}
        onClose={noop}
      />,
    );
    expect(html).toContain("No hands played yet");
  });

  it("hands the tapped hand's ordinal to the scrub", () => {
    const onSelectHand = vi.fn();
    let renderer!: {
      root: {
        findByProps(props: Record<string, unknown>): {
          props: { onClick?: () => void };
        };
      };
    };

    act(() => {
      renderer = create(
        <HandPicker
          summaries={[foldedOutWalk, raiseWarToTurn]}
          seats={[seat(0), seat(1), seat(2)]}
          onSelectHand={onSelectHand}
          onClose={noop}
        />,
      );
    });
    act(() => {
      renderer.root
        .findByProps({ "data-testid": "hand-row-2" })
        .props.onClick?.();
    });

    expect(onSelectHand).toHaveBeenCalledWith(2);
  });

  it("exposes a close control", () => {
    const html = renderToStaticMarkup(
      <HandPicker
        summaries={[]}
        seats={[]}
        onSelectHand={noop}
        onClose={noop}
      />,
    );
    expect(html).toContain('data-testid="close-hand-picker-button"');
  });
});
