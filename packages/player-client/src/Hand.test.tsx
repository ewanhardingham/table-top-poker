import type { PlayerView } from "@table-top-poker/protocol";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Hand, showdownPrompt, showdownTurn } from "./Hand.js";

describe("Hand", () => {
  it("shows a waiting state before any hand has started", () => {
    const view: PlayerView = { phase: "no-hand", button: 0 };
    const html = renderToStaticMarkup(<Hand view={view} seatId={0} />);
    expect(html).toMatch(/data-testid="hand"[^>]*data-phase="no-hand"/);
  });

  it("uses the named seat in waiting copy", () => {
    const view: PlayerView = {
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
      seats: [{ seatId: 0, folded: false, allIn: false }],
      yourSeatId: 0,
      yourHoleCards: [
        { rank: "Q", suit: "diamonds" },
        { rank: "J", suit: "clubs" },
      ],
      legalActions: [],
    };
    const html = renderToStaticMarkup(
      <Hand
        view={view}
        seatId={0}
        seats={[
          {
            id: 0,
            claimed: true,
            displayName: "Blair",
            sittingOut: false,
            sittingOutReason: null,
            disconnected: false,
          },
          {
            id: 1,
            claimed: true,
            displayName: "Avery",
            sittingOut: false,
            sittingOutReason: null,
            disconnected: false,
          },
        ]}
      />,
    );

    expect(html).toContain("Waiting on Avery");
  });

  it("deals own hole cards in face-down, and never shows the shared board mid-hand", () => {
    const view: PlayerView = {
      phase: "betting",
      tabled: [],
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
      toAct: [0],
      seats: [{ seatId: 0, folded: false, allIn: false }],
      yourSeatId: 0,
      yourHoleCards: [
        { rank: "Q", suit: "diamonds" },
        { rank: "J", suit: "clubs" },
      ],
      legalActions: ["fold", "check", "raise"],
    };
    const html = renderToStaticMarkup(<Hand view={view} seatId={0} />);

    expect(html).toMatch(/data-testid="hole-cards"/);
    expect(html).toContain('data-presentation="FaceDown"');
    expect((html.match(/data-face-down="true"/g) ?? []).length).toBe(2);
    expect(html).not.toContain("data-rank");
    expect(html).not.toContain('data-testid="community-cards"');
  });

  it("hides hole cards once folded, without a placeholder leak", () => {
    const view: PlayerView = {
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
        { seatId: 0, folded: true, allIn: false },
        { seatId: 1, folded: false, allIn: false },
      ],
      yourSeatId: 0,
      yourHoleCards: null,
      legalActions: [],
    };
    const html = renderToStaticMarkup(<Hand view={view} seatId={0} />);

    expect(html).toMatch(/data-testid="no-hole-cards"/);
    expect(html).not.toMatch(/data-testid="hole-cards"/);
    expect(html).not.toContain("data-rank");
  });

  it("shows the empty state, not the folded copy, when sitting out of the current hand", () => {
    const view: PlayerView = {
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
      seats: [{ seatId: 1, folded: false, allIn: false }],
      yourSeatId: 0,
      yourHoleCards: null,
      legalActions: [],
    };
    const html = renderToStaticMarkup(<Hand view={view} seatId={0} />);

    expect(html).toMatch(/data-testid="no-hole-cards"/);
    expect(html).not.toMatch(/data-testid="hole-cards"/);
    expect(html).toContain("Waiting for the next deal.");
    expect(html).not.toContain("muck");
  });

  it("shows the turn banner announcing it's your turn when you have a legal action", () => {
    const view: PlayerView = {
      phase: "betting",
      tabled: [],
      turnEndsAt: null,
      button: 0,
      smallBlind: 1,
      bigBlind: 2,
      dealtSeatCount: 3,
      burnedCount: 0,
      street: "turn",
      board: [],
      toAct: [0],
      seats: [{ seatId: 0, folded: false, allIn: false }],
      yourSeatId: 0,
      yourHoleCards: [
        { rank: "Q", suit: "diamonds" },
        { rank: "J", suit: "clubs" },
      ],
      legalActions: ["fold", "check", "raise"],
    };
    const html = renderToStaticMarkup(<Hand view={view} seatId={0} />);

    expect(html).toMatch(/data-testid="turn-banner"[^>]*data-tone="turn"/);
    expect(html).toContain("Your turn");
  });

  it("renders the actor's ring from the server deadline", () => {
    const turnEndsAt = Date.now() + 30_000;
    const view: PlayerView = {
      phase: "betting",
      tabled: [],
      turnEndsAt,
      button: 0,
      smallBlind: 1,
      bigBlind: 2,
      dealtSeatCount: 3,
      burnedCount: 0,
      street: "turn",
      board: [],
      toAct: [0],
      seats: [{ seatId: 0, folded: false, allIn: false }],
      yourSeatId: 0,
      yourHoleCards: null,
      legalActions: ["fold", "check"],
    };
    const html = renderToStaticMarkup(<Hand view={view} seatId={0} />);

    expect(html).toContain('data-testid="turn-banner-shot-clock"');
    expect(html).toContain("30");
  });

  it("does not mirror the table countdown on another player's phone", () => {
    const view: PlayerView = {
      phase: "betting",
      tabled: [],
      turnEndsAt: Date.now() + 30_000,
      button: 0,
      smallBlind: 1,
      bigBlind: 2,
      dealtSeatCount: 3,
      burnedCount: 0,
      street: "turn",
      board: [],
      toAct: [1],
      seats: [
        { seatId: 0, folded: false, allIn: false },
        { seatId: 1, folded: false, allIn: false },
      ],
      yourSeatId: 0,
      yourHoleCards: null,
      legalActions: [],
    };
    const html = renderToStaticMarkup(<Hand view={view} seatId={0} />);

    expect(html).not.toContain('data-testid="turn-banner-shot-clock"');
  });

  it("shows a connection-aware banner instead of the turn state while reconnecting", () => {
    const view: PlayerView = {
      phase: "betting",
      tabled: [],
      turnEndsAt: null,
      button: 0,
      smallBlind: 1,
      bigBlind: 2,
      dealtSeatCount: 3,
      burnedCount: 0,
      street: "turn",
      board: [],
      toAct: [0],
      seats: [{ seatId: 0, folded: false, allIn: false }],
      yourSeatId: 0,
      yourHoleCards: [
        { rank: "Q", suit: "diamonds" },
        { rank: "J", suit: "clubs" },
      ],
      legalActions: ["fold", "check", "raise"],
    };
    const html = renderToStaticMarkup(
      <Hand view={view} seatId={0} connectionStatus="connecting" />,
    );

    expect(html).toMatch(/data-testid="turn-banner"[^>]*data-tone="offline"/);
    expect(html).toContain("Reconnecting");
    expect(html).not.toContain("Your turn");
  });

  describe("all in", () => {
    function allInView(overrides: Partial<PlayerView> = {}): PlayerView {
      return {
        phase: "betting",
        tabled: [],
        turnEndsAt: null,
        button: 0,
        smallBlind: 1,
        bigBlind: 2,
        dealtSeatCount: 3,
        burnedCount: 0,
        street: "turn",
        board: [],
        toAct: [1],
        seats: [
          { seatId: 0, folded: false, allIn: true },
          { seatId: 1, folded: false, allIn: false },
        ],
        yourSeatId: 0,
        yourHoleCards: [
          { rank: "Q", suit: "diamonds" },
          { rank: "J", suit: "clubs" },
        ],
        legalActions: [],
        ...overrides,
      } as PlayerView;
    }

    it("banners the run-out for the seat that is all in", () => {
      const html = renderToStaticMarkup(<Hand view={allInView()} seatId={0} />);

      expect(html).toMatch(/data-testid="turn-banner"[^>]*data-tone="all-in"/);
      expect(html).toContain("All in");
    });

    it("keeps the all-in seat's cards face down and inert through the run-out", () => {
      const html = renderToStaticMarkup(<Hand view={allInView()} seatId={0} />);

      expect(html).toContain('data-presentation="FaceDown"');
      expect(html).toContain('aria-disabled="true"');
    });

    it("leaves a covering seat's own cards live", () => {
      const covering = allInView({ yourSeatId: 1, toAct: [1] });
      const html = renderToStaticMarkup(<Hand view={covering} seatId={1} />);

      expect(html).toContain('aria-disabled="false"');
      expect(html).not.toMatch(
        /data-testid="turn-banner"[^>]*data-tone="all-in"/,
      );
    });
  });

  describe("showdown", () => {
    const shownTable = {
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
        { rank: "9", suit: "diamonds" },
        { rank: "4", suit: "spades" },
      ],
      contestants: [0, 1],
      results: [
        {
          seatId: 0,
          rank: 1,
          bestHand: [
            { rank: "A", suit: "spades" },
            { rank: "A", suit: "diamonds" },
            { rank: "K", suit: "hearts" },
            { rank: "9", suit: "diamonds" },
            { rank: "4", suit: "spades" },
          ],
          description: "Pair of Aces",
          holeCards: [
            { rank: "A", suit: "diamonds" },
            { rank: "7", suit: "clubs" },
          ],
        },
        {
          seatId: 1,
          rank: 2,
          bestHand: [
            { rank: "A", suit: "spades" },
            { rank: "K", suit: "hearts" },
            { rank: "K", suit: "clubs" },
            { rank: "9", suit: "diamonds" },
            { rank: "4", suit: "spades" },
          ],
          description: "Pair of Kings",
          holeCards: [
            { rank: "K", suit: "clubs" },
            { rank: "3", suit: "hearts" },
          ],
        },
      ],
      winners: [0],
    } as const;

    function showdownViewFor(seatId: number): PlayerView {
      const yourResult =
        shownTable.results.find((result) => result.seatId === seatId) ?? null;
      return {
        ...shownTable,
        yourSeatId: seatId,
        yourResult,
        canShow: false,
        canMuck: false,
      };
    }

    it("shows the winner's own hole cards and a win banner, never an opponent's cards", () => {
      const html = renderToStaticMarkup(
        <Hand view={showdownViewFor(0)} seatId={0} />,
      );

      expect(html).toMatch(/data-testid="hand"[^>]*data-phase="showdown"/);
      expect(html).toMatch(/data-testid="turn-banner"[^>]*data-tone="win"/);
      expect(html).toContain("You win with Pair of Aces");
      expect(html).toMatch(/data-testid="hole-cards"/);
      expect(html).toContain('data-rank="A"');
      expect(html).not.toContain('data-rank="K"');
      expect(html).not.toContain("Pair of Kings");
    });

    it("hands the pair to showdown locked, so it renders revealed and inert", () => {
      const html = renderToStaticMarkup(
        <Hand view={showdownViewFor(0)} seatId={0} />,
      );

      expect(html).toContain('data-presentation="Revealed"');
      expect(html).toContain('aria-disabled="true"');
    });

    it("keeps an unshown contestant's own cards face down and still peekable", () => {
      const concealing: PlayerView = {
        ...shownTable,
        results: [],
        winners: null,
        yourSeatId: 1,
        yourResult: shownTable.results[1],
        canShow: true,
        canMuck: false,
      };
      const html = renderToStaticMarkup(<Hand view={concealing} seatId={1} />);

      expect(html).toContain('data-presentation="FaceDown"');
      expect(html).not.toContain('data-presentation="Revealed"');
      expect(html).toContain('aria-disabled="false"');
    });

    it("arms the reveal to publish only on your turn in an open window", () => {
      const contestant = {
        ...shownTable,
        results: [shownTable.results[0]],
        winners: null,
        queue: [1] as readonly number[],
        yourSeatId: 1,
        yourResult: shownTable.results[1],
        canShow: true,
        canMuck: true,
      } satisfies PlayerView;

      expect(showdownTurn(contestant)).toEqual({
        showdownOpen: true,
        showLegal: true,
        muckLegal: true,
      });
      expect(showdownTurn({ ...contestant, winners: [0] }).showLegal).toBe(
        false,
      );
      expect(showdownTurn({ ...contestant, canShow: false }).showLegal).toBe(
        false,
      );
      expect(showdownTurn(showdownViewFor(0)).showdownOpen).toBe(false);
    });

    it("drops the muck line from the prompt while the compulsion stands", () => {
      expect(
        showdownPrompt({
          showdownOpen: true,
          showLegal: true,
          muckLegal: true,
        }),
      ).toBe("Show your hand, or drag up to muck");
      expect(
        showdownPrompt({
          showdownOpen: true,
          showLegal: true,
          muckLegal: false,
        }),
      ).toBe("Show your hand");
      expect(
        showdownPrompt({
          showdownOpen: true,
          showLegal: false,
          muckLegal: false,
        }),
      ).toBeNull();
    });

    it("has no separate show control — the reveal gesture is the show", () => {
      const concealing: PlayerView = {
        ...shownTable,
        results: [shownTable.results[0]],
        winners: [0],
        yourSeatId: 1,
        yourResult: shownTable.results[1],
        canShow: true,
        canMuck: false,
      };
      const html = renderToStaticMarkup(<Hand view={concealing} seatId={1} />);

      expect(html).not.toContain('data-testid="show-my-hand"');
      expect(html).toContain('aria-disabled="false"');
    });

    it("says why a show did not go through, on the screen that offered it", () => {
      const concealing: PlayerView = {
        ...shownTable,
        results: [shownTable.results[0]],
        winners: [0],
        yourSeatId: 1,
        yourResult: shownTable.results[1],
        canShow: true,
        canMuck: false,
      };
      const html = renderToStaticMarkup(
        <Hand
          view={concealing}
          seatId={1}
          intent={{
            legalActions: [],
            pendingAction: null,
            rejection: { action: null, reason: "not-at-showdown" },
            fold: () => undefined,
            check: () => undefined,
            call: () => undefined,
            raise: () => undefined,
            allIn: () => undefined,
            show: () => undefined,
            muck: () => undefined,
          }}
        />,
      );

      expect(html).toContain('data-testid="action-rejection"');
      expect(html).toContain("There&#x27;s no hand of yours to show.");
    });

    it("never puts another seat's shown cards on a player's phone", () => {
      const html = renderToStaticMarkup(
        <Hand view={showdownViewFor(1)} seatId={1} />,
      );

      expect(html).toContain('data-rank="K"');
      expect(html).not.toContain('data-rank="7"');
    });

    it("shows the loser's own hole cards and a loss banner naming the winner", () => {
      const html = renderToStaticMarkup(
        <Hand view={showdownViewFor(1)} seatId={1} />,
      );

      expect(html).toMatch(/data-testid="turn-banner"[^>]*data-tone="loss"/);
      expect(html).toContain(
        "Seat 1 wins with Pair of Aces — you had Pair of Kings",
      );
      expect(html).toContain('data-rank="K"');
      expect(html).not.toContain('data-rank="A"');
    });

    it("reads a fold message and shows no hole cards for a seat that folded before showdown", () => {
      const html = renderToStaticMarkup(
        <Hand view={showdownViewFor(2)} seatId={2} />,
      );

      expect(html).toMatch(/data-testid="no-hole-cards"/);
      expect(html).not.toMatch(/data-testid="hole-cards"/);
      expect(html).toContain("you folded earlier");
      expect(html).toContain("You folded — cards are in the muck.");
    });
  });

  describe("folded-out", () => {
    it("shows a win banner and no hole cards when everyone else folded", () => {
      const view: PlayerView = {
        phase: "folded-out",
        button: 0,
        smallBlind: 1,
        bigBlind: 2,
        dealtSeatCount: 3,
        burnedCount: 0,
        board: [],
        winner: 0,
      };
      const html = renderToStaticMarkup(<Hand view={view} seatId={0} />);

      expect(html).toMatch(/data-testid="hand"[^>]*data-phase="folded-out"/);
      expect(html).toMatch(/data-testid="turn-banner"[^>]*data-tone="win"/);
      expect(html).toContain("You win — everyone folded");
      expect(html).toMatch(/data-testid="no-hole-cards"/);
      expect(html).not.toMatch(/data-testid="hole-cards"/);
    });

    it("shows a loss banner naming the winner when this seat folded", () => {
      const view: PlayerView = {
        phase: "folded-out",
        button: 0,
        smallBlind: 1,
        bigBlind: 2,
        dealtSeatCount: 3,
        burnedCount: 0,
        board: [],
        winner: 1,
      };
      const html = renderToStaticMarkup(<Hand view={view} seatId={0} />);

      expect(html).toMatch(/data-testid="turn-banner"[^>]*data-tone="loss"/);
      expect(html).toContain("Seat 2 wins — everyone folded");
      expect(html).toContain("You folded — cards are in the muck.");
    });

    it("never reveals a pair for a seat that folded out — folding is final", () => {
      const view: PlayerView = {
        phase: "folded-out",
        button: 0,
        smallBlind: 1,
        bigBlind: 2,
        dealtSeatCount: 3,
        burnedCount: 0,
        board: [],
        winner: 1,
      };
      const html = renderToStaticMarkup(<Hand view={view} seatId={0} />);

      expect(html).not.toMatch(/data-testid="hole-cards"/);
      expect(html).not.toContain("data-rank");
      expect(html).not.toContain("data-presentation");
    });
  });

  describe("position marker (issue #207)", () => {
    const bettingView: PlayerView = {
      phase: "betting",
      tabled: [],
      turnEndsAt: null,
      button: 0,
      smallBlind: 1,
      bigBlind: 2,
      dealtSeatCount: 6,
      burnedCount: 0,
      street: "flop",
      board: [],
      toAct: [3],
      seats: [
        { seatId: 0, folded: false, allIn: false },
        { seatId: 1, folded: false, allIn: false },
        { seatId: 2, folded: false, allIn: false },
        { seatId: 3, folded: false, allIn: false },
      ],
      yourSeatId: 0,
      yourHoleCards: null,
      legalActions: [],
    };

    it.each([
      [0, "button"],
      [1, "small-blind"],
      [2, "big-blind"],
    ])(
      "gives seat %i's banner the %s disc in place of the tone dot",
      (seatId, marker) => {
        const html = renderToStaticMarkup(
          <Hand
            view={{ ...bettingView, yourSeatId: seatId }}
            seatId={seatId}
          />,
        );

        expect(html).toContain(`data-marker="${marker}"`);
        expect(html).not.toContain('data-testid="turn-banner-dot"');
      },
    );

    it("leaves the tone dot alone for a seat holding no position", () => {
      const html = renderToStaticMarkup(
        <Hand view={{ ...bettingView, yourSeatId: 3 }} seatId={3} />,
      );

      expect(html).toContain('data-testid="turn-banner-dot"');
      expect(html).not.toContain('data-testid="position-badge"');
    });

    const otherPhases: readonly (readonly [string, PlayerView])[] = [
      ["no-hand", { phase: "no-hand", button: 0 }],
      [
        "showdown",
        {
          phase: "showdown",
          turnEndsAt: null,
          queue: [],
          mucked: [],
          button: 0,
          smallBlind: 1,
          bigBlind: 2,
          dealtSeatCount: 3,
          burnedCount: 0,
          board: [],
          contestants: [0, 1],
          results: [],
          winners: [1],
          yourSeatId: 0,
          yourResult: null,
          canShow: true,
          canMuck: false,
        },
      ],
      [
        "folded-out",
        {
          phase: "folded-out",
          button: 0,
          smallBlind: 1,
          bigBlind: 2,
          dealtSeatCount: 3,
          burnedCount: 0,
          board: [],
          winner: 1,
        },
      ],
    ];

    it.each(otherPhases)(
      "carries the marker through the %s phase too",
      (_phase, view) => {
        const html = renderToStaticMarkup(<Hand view={view} seatId={0} />);
        expect(html).toContain('data-marker="button"');
      },
    );

    it("shows the heads-up button its disc and the other seat nothing", () => {
      const headsUp: PlayerView = {
        ...bettingView,
        button: 0,
        smallBlind: 0,
        bigBlind: 1,
        dealtSeatCount: 2,
        burnedCount: 0,
      };

      expect(
        renderToStaticMarkup(
          <Hand view={{ ...headsUp, yourSeatId: 0 }} seatId={0} />,
        ),
      ).toContain('data-marker="button"');
      expect(
        renderToStaticMarkup(
          <Hand view={{ ...headsUp, yourSeatId: 1 }} seatId={1} />,
        ),
      ).not.toContain('data-testid="position-badge"');
    });

    it("dims the disc while the banner is reporting a dropped connection", () => {
      const html = renderToStaticMarkup(
        <Hand view={bettingView} seatId={0} connectionStatus="disconnected" />,
      );

      expect(html).toMatch(/data-testid="turn-banner"[^>]*data-tone="offline"/);
      expect(html).toContain('data-marker="button"');
      expect(html).toContain("opacity:0.55");
    });

    it("keeps the disc at full strength while connected", () => {
      const html = renderToStaticMarkup(
        <Hand view={bettingView} seatId={0} connectionStatus="connected" />,
      );

      expect(html).toContain("opacity:1");
    });
  });
});

describe("Hand in the showing window", () => {
  const yourResult = {
    seatId: 1,
    rank: 2,
    description: "Pair of Kings",
    holeCards: [
      { rank: "K", suit: "clubs" },
      { rank: "4", suit: "hearts" },
    ],
    bestHand: [
      { rank: "K", suit: "hearts" },
      { rank: "K", suit: "clubs" },
      { rank: "A", suit: "spades" },
      { rank: "9", suit: "diamonds" },
      { rank: "4", suit: "spades" },
    ],
  } as const;

  const yourTurn: PlayerView = {
    phase: "showdown",
    turnEndsAt: Date.now() + 4000,
    button: 0,
    smallBlind: 1,
    bigBlind: 0,
    dealtSeatCount: 2,
    burnedCount: 0,
    board: [],
    contestants: [0, 1],
    results: [],
    queue: [1, 0],
    mucked: [],
    winners: null,
    yourSeatId: 1,
    yourResult,
    canShow: true,
    canMuck: false,
  };

  it("prompts without the muck line while the compulsion stands", () => {
    const html = renderToStaticMarkup(<Hand view={yourTurn} seatId={1} />);

    expect(html).toMatch(/data-testid="turn-banner"[^>]*data-tone="turn"/);
    expect(html).toContain("Show your hand");
    expect(html).not.toContain("drag up to muck");
  });

  it("offers the muck once some hand is face-up", () => {
    const html = renderToStaticMarkup(
      <Hand view={{ ...yourTurn, canMuck: true }} seatId={1} />,
    );

    expect(html).toContain("Show your hand, or drag up to muck");
  });

  it("rings the clock in the turn banner while it is their turn", () => {
    const html = renderToStaticMarkup(<Hand view={yourTurn} seatId={1} />);

    expect(html).toContain('data-testid="turn-banner-shot-clock"');
  });

  it("sizes the ring by the room's showdown clock, not a default", () => {
    const html = renderToStaticMarkup(
      <Hand view={yourTurn} seatId={1} showdownClockSeconds={10} />,
    );

    // 4s left of 10 leaves the ring past the amber turn, not near-full.
    expect(html).toContain('data-testid="turn-banner-shot-clock"');
    expect(html).toContain("4");
  });

  it("carries no clock and no prompt behind the head of the queue", () => {
    const waiting: PlayerView = {
      ...yourTurn,
      queue: [0, 1],
      canShow: false,
      canMuck: false,
    };
    const html = renderToStaticMarkup(<Hand view={waiting} seatId={1} />);

    expect(html).not.toContain('data-testid="turn-banner-shot-clock"');
    expect(html).not.toContain("Show your hand");
    expect(html).toContain("Waiting on");
  });

  it("says the cards are mucked once this seat has declined", () => {
    const mucked: PlayerView = {
      ...yourTurn,
      queue: [0],
      mucked: [1],
      yourResult: null,
      canShow: false,
      canMuck: false,
    };
    const html = renderToStaticMarkup(<Hand view={mucked} seatId={1} />);

    expect(html).toContain("You mucked");
  });
});
