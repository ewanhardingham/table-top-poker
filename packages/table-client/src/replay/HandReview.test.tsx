import type {
  Card,
  HandEvent,
  SeatView,
  TableReplayPosition,
  TableView,
} from "@table-top-poker/protocol";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
/* eslint-disable @typescript-eslint/no-deprecated -- React 19's DOM-free component test renderer is deprecated but remains the available interaction harness here. */
import { act, create } from "react-test-renderer";
import { describe, expect, it, vi } from "vitest";
import type { HandReviewState } from "../store/replaySlice.js";
import { HandReview } from "./HandReview.js";
import type { ReplayStageProps } from "./ReplayStage.js";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const stagedView = vi.hoisted((): { current: TableView | null } => ({
  current: null,
}));

/**
 * The felt is the live `Seats` and `Board`; what matters here is *which*
 * projected view they are handed at a position, so the stage is stood in for
 * and the view it received is read back.
 */
vi.mock("./ReplayStage.js", () => ({
  ReplayStage: (props: ReplayStageProps) => {
    stagedView.current = props.view;
    return React.createElement("div", { "data-testid": "replay-stage" });
  },
}));

vi.stubGlobal("window", {
  setTimeout: (handler: () => void, ms: number) => setTimeout(handler, ms),
  clearTimeout: (id: number) => {
    clearTimeout(id);
  },
  addEventListener: () => undefined,
  removeEventListener: () => undefined,
});

const seats: readonly SeatView[] = [0, 1, 2].map((id) => ({
  id,
  claimed: true,
  sittingOut: false,
  sittingOutReason: null,
  disconnected: false,
}));

const card = (rank: Card["rank"]): Card => ({ rank, suit: "clubs" });

function bettingView(board: readonly Card[]): TableView {
  return {
    phase: "betting",
    turnEndsAt: null,
    button: 0,
    smallBlind: 1,
    bigBlind: 2,
    dealtSeatCount: 3,
    street: board.length === 0 ? "preflop" : "flop",
    board,
    toAct: [1],
    seats: [
      { seatId: 0, folded: false },
      { seatId: 1, folded: false },
      { seatId: 2, folded: false },
    ],
  };
}

/**
 * A hand that reaches the flop and folds out, paired with the boards the
 * table saw — the cascade order (`StreetClosed → BoardDealt → StreetStarted`)
 * is what the chapter anchoring turns on.
 */
const events: readonly HandEvent[] = [
  { type: "HandStarted", seed: "s", button: 0 },
  { type: "HoleCardsDealt", deals: [] },
  { type: "StreetStarted", street: "preflop", actor: 1 },
  { type: "ActionTaken", seatId: 1, action: "check" },
  { type: "StreetClosed", street: "preflop" },
  {
    type: "BoardDealt",
    street: "flop",
    cards: [card("A"), card("K"), card("Q")],
  },
  { type: "StreetStarted", street: "flop", actor: 1 },
  { type: "ActionTaken", seatId: 1, action: "fold" },
  { type: "HandFoldedOut", winner: 2 },
  { type: "HandComplete" },
];

const flop = [card("A"), card("K"), card("Q")];

const foldedOut: TableView = {
  phase: "folded-out",
  button: 0,
  smallBlind: 1,
  bigBlind: 2,
  dealtSeatCount: 3,
  winner: 2,
};

const positions: readonly TableReplayPosition[] = [
  { event: null, view: { phase: "no-hand", button: 0 } },
  ...events.map((event, index) => ({
    event,
    view: index >= 8 ? foldedOut : bettingView(index >= 5 ? flop : []),
  })),
];

const ready: HandReviewState = { status: "ready", handOrdinal: 7, positions };

interface Node {
  readonly props: {
    readonly onClick?: () => void;
    readonly onPointerDown?: (event: { readonly clientX: number }) => void;
  };
}

interface Renderer {
  readonly root: {
    findByProps(props: Record<string, unknown>): Node;
  };
}

function render(review: HandReviewState = ready): Renderer {
  let renderer!: Renderer;
  act(() => {
    renderer = create(
      <HandReview review={review} seats={seats} onClose={() => undefined} />,
    );
  });
  return renderer;
}

function click(renderer: Renderer, testId: string): void {
  act(() => {
    renderer.root.findByProps({ "data-testid": testId }).props.onClick?.();
  });
}

describe("HandReview", () => {
  it("ticks the track once per event ordinal, heavier at street boundaries", () => {
    const html = renderToStaticMarkup(
      <HandReview review={ready} seats={seats} onClose={() => undefined} />,
    );

    for (const position of events.map((_unused, index) => index + 1)) {
      expect(html).toContain(`data-testid="replay-tick-${String(position)}"`);
    }
    expect(html).not.toContain(
      `data-testid="replay-tick-${String(events.length + 1)}"`,
    );
    expect(html.match(/data-street-boundary="true"/g)).toHaveLength(2);
  });

  it("offers a chapter for each street the hand reached, and no others", () => {
    const html = renderToStaticMarkup(
      <HandReview review={ready} seats={seats} onClose={() => undefined} />,
    );

    expect(html).toContain('data-testid="replay-chapter-preflop"');
    expect(html).toContain('data-testid="replay-chapter-flop"');
    expect(html).not.toContain('data-testid="replay-chapter-turn"');
  });

  it("seeks a chapter to the street's BoardDealt, so the cards are seen arriving", () => {
    const renderer = render();

    click(renderer, "replay-chapter-flop");

    expect(positions[6]?.event?.type).toBe("BoardDealt");
    expect(stagedView.current).toBe(positions[6]?.view);
    const view = stagedView.current;
    expect(view?.phase === "betting" ? view.board : []).toHaveLength(3);
    // The position before it has a bare felt, which is what makes this a
    // *deal* rather than cards that were suddenly always there.
    const before = positions[5]?.view;
    expect(before?.phase === "betting" ? before.board : ["x"]).toHaveLength(0);
  });

  it("opens at position 0, not mid-hand and not playing", () => {
    render();

    expect(stagedView.current?.phase).toBe("no-hand");
  });

  it("keeps autoplay off until it is asked for, then advances the felt", async () => {
    vi.useFakeTimers();
    try {
      const renderer = render();
      expect(stagedView.current?.phase).toBe("no-hand");

      click(renderer, "replay-play");
      await act(async () => {
        await vi.advanceTimersByTimeAsync(5_000);
      });

      expect(stagedView.current?.phase).not.toBe("no-hand");
    } finally {
      vi.useRealTimers();
    }
  });

  it("stops autoplay when the track is pressed", async () => {
    vi.useFakeTimers();
    try {
      const renderer = render();
      click(renderer, "replay-play");
      await act(async () => {
        await vi.advanceTimersByTimeAsync(2_000);
      });
      const held = stagedView.current;

      act(() => {
        renderer.root
          .findByProps({ "data-testid": "replay-track" })
          .props.onClick?.();
      });
      act(() => {
        renderer.root
          .findByProps({ "data-testid": "replay-track" })
          .props.onPointerDown?.({ clientX: 0 });
      });
      await act(async () => {
        await vi.advanceTimersByTimeAsync(10_000);
      });

      expect(stagedView.current).toBe(held);
    } finally {
      vi.useRealTimers();
    }
  });

  it("offers a way back to the picker", () => {
    const html = renderToStaticMarkup(
      <HandReview review={ready} seats={seats} onClose={() => undefined} />,
    );

    expect(html).toContain('data-testid="back-to-hands-button"');
    expect(html).toContain("Back to hands");
  });

  it("says so while the hand is on its way, and if it never arrives", () => {
    const loading = renderToStaticMarkup(
      <HandReview
        review={{ status: "loading", handOrdinal: 7 }}
        seats={seats}
        onClose={() => undefined}
      />,
    );
    const unavailable = renderToStaticMarkup(
      <HandReview
        review={{ status: "unavailable", handOrdinal: 7 }}
        seats={seats}
        onClose={() => undefined}
      />,
    );

    expect(loading).toContain("Loading the hand");
    expect(unavailable).toContain("can&#x27;t be replayed");
    expect(unavailable).toContain('data-testid="back-to-hands-button"');
  });
});
