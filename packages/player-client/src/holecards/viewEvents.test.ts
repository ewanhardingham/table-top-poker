import type { Card } from "@table-top-poker/protocol";
import { describe, expect, it } from "vitest";
import type { CardState } from "./cardState.js";
import type { CardActions } from "./ports.js";
import type { HoleCardPairProps } from "./HoleCardPair.js";
import { eventsForPropChange, eventsForVisibility } from "./viewEvents.js";

const actions: CardActions = {
  foldLegal: false,
  checkLegal: false,
  pending: false,
  fold: () => undefined,
  check: () => undefined,
};

const queenJack: readonly [Card, Card] = [
  { rank: "Q", suit: "diamonds" },
  { rank: "J", suit: "clubs" },
];

function props(overrides: Partial<HoleCardPairProps> = {}): HoleCardPairProps {
  return { cards: null, locked: false, actions, ...overrides };
}

const faceDown: CardState = {
  presentation: "FaceDown",
  recognizer: "Idle",
  armed: false,
  locked: false,
};
const absent: CardState = {
  presentation: "Absent",
  recognizer: "Idle",
  armed: false,
  locked: false,
};
/** A pair the showdown has decided: face-up and inert. */
const lockedRevealed: CardState = {
  presentation: "Revealed",
  recognizer: "Idle",
  armed: false,
  locked: true,
};
/** A bend in progress: the state an incoming view must not disturb. */
const peeking: CardState = {
  presentation: "Peeking",
  recognizer: "Bending",
  armed: false,
  locked: false,
};
/** The same pair, still live: the Player turned it over themselves. */
const revealed: CardState = {
  presentation: "Revealed",
  recognizer: "Idle",
  armed: false,
  locked: false,
};

describe("eventsForPropChange", () => {
  it("produces nothing by default — an incoming view is inert unless proven otherwise", () => {
    const before = props({ cards: queenJack });
    expect(eventsForPropChange(before, { ...before }, faceDown)).toEqual([]);
  });

  it("produces nothing for a new street, a new board card or another player's bet", () => {
    // None of those reach this module at all: they change `PlayerView`, not
    // any of the three props, so the adapter sees an identical pair of props.
    const before = props({ cards: queenJack });
    const after = props({ cards: before.cards });
    expect(eventsForPropChange(before, after, faceDown)).toEqual([]);
  });

  it("produces nothing when the turn changes — legality is arming input, not a lifecycle event", () => {
    const before = props({ cards: queenJack });
    const after = props({
      cards: queenJack,
      actions: { ...actions, foldLegal: true, checkLegal: true },
    });
    expect(eventsForPropChange(before, after, faceDown)).toEqual([]);
  });

  it("leaves a peek in flight alone when a server update arrives", () => {
    // `fanOutHandUpdate` sends a view for every event in the hand, and peeking
    // at your cards is exactly what you do while others act. A new board card
    // or another player's bet reaches this module as an identical pair of
    // props; nothing may touch the recognizer.
    const before = props({ cards: queenJack });
    const after = props({ cards: queenJack });
    expect(eventsForPropChange(before, after, peeking)).toEqual([]);
  });

  it("produces nothing when the player acts — a button sends an Action, not a presentation change", () => {
    // Pressing Call, Raise or Check changes the view (stack, pot, `toAct`) and
    // hands the turn on, so legality goes away. The cards stay exactly as they
    // were.
    const before = props({
      cards: queenJack,
      actions: { ...actions, foldLegal: true, checkLegal: true },
    });
    const after = props({ cards: queenJack });
    expect(eventsForPropChange(before, after, revealed)).toEqual([]);
  });

  it("deals in when cards arrive from nothing", () => {
    expect(
      eventsForPropChange(props(), props({ cards: queenJack }), absent),
    ).toEqual([{ type: "DEALT" }]);
  });

  it("deals in on a card-identity change with no intervening empty view", () => {
    const next: readonly [Card, Card] = [
      { rank: "7", suit: "spades" },
      { rank: "2", suit: "hearts" },
    ];
    expect(
      eventsForPropChange(
        props({ cards: queenJack }),
        props({ cards: next }),
        faceDown,
      ),
    ).toEqual([{ type: "DEALT" }]);
  });

  it("treats an equal-valued but newly built pair as the same cards", () => {
    const sameValues: readonly [Card, Card] = [
      { rank: "Q", suit: "diamonds" },
      { rank: "J", suit: "clubs" },
    ];
    expect(
      eventsForPropChange(
        props({ cards: queenJack }),
        props({ cards: sameValues }),
        faceDown,
      ),
    ).toEqual([]);
  });

  it("deals in when only one card of the pair changes", () => {
    const swapped: readonly [Card, Card] = [
      { rank: "Q", suit: "diamonds" },
      { rank: "J", suit: "spades" },
    ];
    expect(
      eventsForPropChange(
        props({ cards: queenJack }),
        props({ cards: swapped }),
        faceDown,
      ),
    ).toEqual([{ type: "DEALT" }]);
  });

  it("empties the pair when the cards go away", () => {
    expect(
      eventsForPropChange(props({ cards: queenJack }), props(), faceDown),
    ).toEqual([{ type: "CARDS_GONE" }]);
  });

  it("produces nothing while the seat holds no cards at all", () => {
    expect(eventsForPropChange(props(), props(), absent)).toEqual([]);
  });

  it("produces nothing when the cards go away from a pair already showing nothing", () => {
    expect(
      eventsForPropChange(props({ cards: queenJack }), props(), absent),
    ).toEqual([]);
  });

  describe("a resolving Action", () => {
    const pending = { ...actions, pending: true };
    /** The pair mid-flight to the muck, waiting on the server's answer. */
    const leaving: CardState = {
      presentation: "Leaving",
      recognizer: "Idle",
      armed: false,
      locked: false,
    };

    it("acknowledges the Fold: the cards are gone and stay gone", () => {
      expect(
        eventsForPropChange(
          props({ cards: queenJack, actions: pending }),
          props(),
          leaving,
        ),
      ).toEqual([
        { type: "CARDS_GONE" },
        { type: "PENDING_RESOLVED", hasCards: false },
      ]);
    });

    it("rejects the Fold: the cards are still in hand, so they come back", () => {
      expect(
        eventsForPropChange(
          props({ cards: queenJack, actions: pending }),
          props({ cards: queenJack }),
          leaving,
        ),
      ).toEqual([{ type: "PENDING_RESOLVED", hasCards: true }]);
    });

    it("produces nothing while the Action is still in flight", () => {
      const before = props({ cards: queenJack, actions: pending });
      expect(eventsForPropChange(before, { ...before }, leaving)).toEqual([]);
    });

    it("produces nothing when an Action *starts* — sending is not a lifecycle event", () => {
      // The pair moved itself to `Leaving` on the release that sent the Fold;
      // the prop going true afterwards has nothing left to say.
      expect(
        eventsForPropChange(
          props({ cards: queenJack }),
          props({ cards: queenJack, actions: pending }),
          leaving,
        ),
      ).toEqual([]);
    });
  });

  describe("showdown", () => {
    it("reveals when locked goes false → true", () => {
      expect(
        eventsForPropChange(
          props({ cards: queenJack }),
          props({ cards: queenJack, locked: true }),
          faceDown,
        ),
      ).toEqual([{ type: "SHOWDOWN_REVEAL" }]);
    });

    it("produces nothing while locked is unchanged, true or false", () => {
      const stillLocked = props({ cards: queenJack, locked: true });
      expect(
        eventsForPropChange(stillLocked, { ...stillLocked }, lockedRevealed),
      ).toEqual([]);

      const stillLive = props({ cards: queenJack });
      expect(
        eventsForPropChange(stillLive, { ...stillLive }, faceDown),
      ).toEqual([]);
    });

    it("produces nothing when a lock is released — showdown does not un-reveal", () => {
      expect(
        eventsForPropChange(
          props({ cards: queenJack, locked: true }),
          props({ cards: queenJack }),
          lockedRevealed,
        ),
      ).toEqual([]);
    });

    it("deals the cards in before revealing them when both land at once", () => {
      // A seat whose cards were withheld until showdown: the deal has to be
      // observed first, or the reveal would land on an `Absent` pair.
      expect(
        eventsForPropChange(
          props(),
          props({ cards: queenJack, locked: true }),
          absent,
        ),
      ).toEqual([{ type: "DEALT" }, { type: "SHOWDOWN_REVEAL" }]);
    });

    it("never reveals a seat that folded out — no cards, no reveal", () => {
      expect(
        eventsForPropChange(props(), props({ locked: true }), absent),
      ).toEqual([]);
    });
  });
});

describe("eventsForVisibility", () => {
  it("resets when the app leaves the foreground", () => {
    expect(eventsForVisibility("hidden")).toEqual([{ type: "RESET" }]);
  });

  it("produces nothing on return to the foreground", () => {
    // The reset already happened on the way out; coming back is not a second
    // disturbance, and re-hiding cards the Player has since turned over would
    // be one.
    expect(eventsForVisibility("visible")).toEqual([]);
  });
});
