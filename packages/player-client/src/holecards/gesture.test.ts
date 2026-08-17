import { describe, expect, it } from "vitest";
import {
  reduce,
  releaseCommitsFold,
  type CardState,
  type Presentation,
  type Recognizer,
} from "./cardState.js";
import { BEND_TRAVEL_PX, MOVE_SLOP_PX, REVEAL_THRESHOLD } from "./constants.js";
import { foldThreshold } from "./geometry.js";
import {
  applyCardEvent,
  beginGesture,
  endGesture,
  moveGesture,
  type GestureSession,
} from "./gesture.js";

function press(
  overrides: Partial<Parameters<typeof beginGesture>[0]> = {},
): GestureSession {
  return beginGesture({
    pointerId: 1,
    x: 100,
    y: 100,
    fromBendZone: false,
    startedRevealed: false,
    ...overrides,
  });
}

const VIEWPORT_HEIGHT = 900;
const FOLD_THRESHOLD_PX = foldThreshold(VIEWPORT_HEIGHT);

const onTurn = { foldLegal: true, foldThresholdPx: FOLD_THRESHOLD_PX };

function to(dx: number, dy: number) {
  return { x: 100 + dx, y: 100 + dy };
}

function state(
  presentation: Presentation,
  recognizer: Recognizer = "Idle",
): CardState {
  return { presentation, recognizer, armed: false, locked: false };
}

describe("moveGesture", () => {
  it("classifies nothing under the slop, so a tap with a wobble is still a tap", () => {
    const step = moveGesture(press(), to(MOVE_SLOP_PX - 1, 0), onTurn);

    expect(step.session.classification).toBeNull();
    expect(step.events).toEqual([]);
    expect(step.bend).toBeNull();
  });

  it("classifies once past the slop and reports it as a single event", () => {
    const step = moveGesture(
      press({ fromBendZone: true }),
      to(-(MOVE_SLOP_PX + 1), 0),
      onTurn,
    );

    expect(step.session.classification).toBe("Bending");
    expect(step.events).toEqual([{ type: "CLASSIFIED", as: "Bending" }]);
  });

  it("keeps the first classification for the rest of the gesture", () => {
    const slid = moveGesture(press(), to(-40, 0), onTurn);
    const curved = moveGesture(slid.session, to(-40, -400), onTurn);

    expect(slid.session.classification).toBe("Ignored");
    expect(curved.session.classification).toBe("Ignored");
    expect(curved.events).toEqual([]);
  });

  it("produces no events at all once classified, so a drag never re-renders", () => {
    const bending = moveGesture(
      press({ fromBendZone: true }),
      to(-20, 0),
      onTurn,
    );

    for (const distance of [30, 60, 90, 140]) {
      const step = moveGesture(bending.session, to(-distance, 0), onTurn);
      expect(step.events).toEqual([]);
      expect(step.bend).not.toBeNull();
    }
  });

  it("reports peel progress and axis while bending", () => {
    const bending = moveGesture(
      press({ fromBendZone: true }),
      to(-20, 0),
      onTurn,
    );
    const step = moveGesture(bending.session, to(-88, -0), onTurn);

    expect(step.bend).toEqual({ progress: 88 / BEND_TRAVEL_PX, axis: "left" });
  });

  it("reports the upward axis when the finger is over the card face", () => {
    const bending = moveGesture(
      press({ fromBendZone: true }),
      to(0, -20),
      onTurn,
    );
    const step = moveGesture(bending.session, to(-20, -60), onTurn);

    expect(step.bend?.axis).toBe("up");
  });

  it("reports no peel for a drag that is not a bend", () => {
    const folding = moveGesture(press(), to(0, -40), onTurn);
    const ignored = moveGesture(press(), to(40, 0), onTurn);

    expect(folding.session.classification).toBe("FoldDragging");
    expect(folding.bend).toBeNull();
    expect(ignored.bend).toBeNull();
  });

  it("samples fold legality at classification and never re-reads it", () => {
    const offTurn = moveGesture(press(), to(0, -40), {
      ...onTurn,
      foldLegal: false,
    });
    expect(offTurn.session.classification).toBe("Ignored");

    const later = moveGesture(offTurn.session, to(0, -400), onTurn);
    expect(later.session.classification).toBe("Ignored");
  });
});

describe("crossing the reveal threshold", () => {
  function inward(progress: number) {
    return -(progress * BEND_TRAVEL_PX);
  }

  it("commits when the peel reaches the threshold", () => {
    const bending = moveGesture(
      press({ fromBendZone: true }),
      to(-20, 0),
      onTurn,
    );
    const crossing = moveGesture(
      bending.session,
      to(inward(REVEAL_THRESHOLD), 0),
      onTurn,
    );

    expect(crossing.events).toEqual([{ type: "BEND_CROSSED" }]);
    expect(crossing.session.crossed).toBe(true);
  });

  it("announces the crossing exactly once, however far the drag continues", () => {
    const bending = moveGesture(
      press({ fromBendZone: true }),
      to(-20, 0),
      onTurn,
    );
    const crossed = moveGesture(
      bending.session,
      to(inward(REVEAL_THRESHOLD), 0),
      onTurn,
    ).session;

    for (const progress of [0.95, 1, 0.5, 0]) {
      const step = moveGesture(crossed, to(inward(progress), 0), onTurn);
      expect(step.events).toEqual([]);
      expect(step.session.crossed).toBe(true);
    }
  });

  it("stops driving the peel from the finger once committed", () => {
    const bending = moveGesture(
      press({ fromBendZone: true }),
      to(-20, 0),
      onTurn,
    );
    const crossed = moveGesture(
      bending.session,
      to(inward(REVEAL_THRESHOLD), 0),
      onTurn,
    ).session;

    expect(moveGesture(crossed, to(-10, 0), onTurn).bend).toBeNull();
  });

  it("classifies and commits in one move when the flick is fast enough", () => {
    const flick = moveGesture(
      press({ fromBendZone: true }),
      to(inward(1), 0),
      onTurn,
    );

    expect(flick.events).toEqual([
      { type: "CLASSIFIED", as: "Bending" },
      { type: "BEND_CROSSED" },
    ]);
  });

  it("never commits a drag that is not a bend, however far it goes", () => {
    for (const session of [press(), press({ fromBendZone: false })]) {
      const dragged = moveGesture(session, to(0, inward(4)), onTurn);
      expect(dragged.session.classification).toBe("FoldDragging");
      expect(dragged.events).not.toContainEqual({ type: "BEND_CROSSED" });
      expect(dragged.session.crossed).toBe(false);
    }
  });
});

describe("the fold drag", () => {
  function dragging(up: number) {
    return moveGesture(press(), to(0, -up), onTurn);
  }

  it("tracks the finger so the player can feel how far they are from committing", () => {
    const step = dragging(60);

    expect(step.session.classification).toBe("FoldDragging");
    expect(step.fold).toEqual({ offset: -60 });
  });

  it("moves the pair up only, so a fold drag cannot push the cards downward", () => {
    const started = dragging(40).session;

    expect(moveGesture(started, to(0, 30), onTurn).fold).toEqual({ offset: 0 });
  });

  it("reports no peel — a fold drag moves the pair without turning it over", () => {
    expect(dragging(60).bend).toBeNull();
  });

  it("arms as the threshold is reached, and says so exactly once", () => {
    const short = dragging(FOLD_THRESHOLD_PX - 1);
    expect(short.events).toEqual([{ type: "CLASSIFIED", as: "FoldDragging" }]);
    expect(short.session.armed).toBe(false);

    const armed = moveGesture(short.session, to(0, -FOLD_THRESHOLD_PX), onTurn);
    expect(armed.events).toEqual([{ type: "FOLD_ARMED" }]);
    expect(armed.session.armed).toBe(true);

    const further = moveGesture(armed.session, to(0, -600), onTurn);
    expect(further.events).toEqual([]);
    expect(further.session.armed).toBe(true);
  });

  it("disarms again when the player pulls the cards back down", () => {
    const armed = moveGesture(
      dragging(FOLD_THRESHOLD_PX).session,
      to(0, -(FOLD_THRESHOLD_PX + 40)),
      onTurn,
    ).session;

    const pulledBack = moveGesture(armed, to(0, -20), onTurn);
    expect(pulledBack.events).toEqual([{ type: "FOLD_DISARMED" }]);
    expect(pulledBack.session.armed).toBe(false);
    expect(pulledBack.fold).toEqual({ offset: -20 });
  });

  it("disarms the session on FOLD_DISARMED so the release commits nothing", () => {
    const armed = moveGesture(
      dragging(FOLD_THRESHOLD_PX).session,
      to(0, -(FOLD_THRESHOLD_PX + 40)),
      onTurn,
    ).session;
    expect(endGesture(armed, { cancelled: false }).commitsFold).toBe(true);

    const disarmed = applyCardEvent(armed, { type: "FOLD_DISARMED" });
    if (disarmed === null) throw new Error("expected a live fold drag");

    expect(disarmed).toEqual({ ...armed, armed: false });
    expect(endGesture(disarmed, { cancelled: false }).commitsFold).toBe(false);
  });

  it("keeps the cards tracking the finger after a view disarms the drag", () => {
    const armed = moveGesture(
      dragging(FOLD_THRESHOLD_PX).session,
      to(0, -(FOLD_THRESHOLD_PX + 40)),
      onTurn,
    ).session;
    const disarmed = applyCardEvent(armed, { type: "FOLD_DISARMED" });
    if (disarmed === null) throw new Error("expected a live fold drag");

    const moved = moveGesture(
      disarmed,
      to(0, -(FOLD_THRESHOLD_PX + 80)),
      onTurn,
    );
    expect(moved.fold).toEqual({ offset: -(FOLD_THRESHOLD_PX + 80) });
    expect(moved.session.classification).toBe("FoldDragging");
  });

  it("leaves the session alone for every other lifecycle event", () => {
    const armed = dragging(FOLD_THRESHOLD_PX).session;

    for (const event of [
      { type: "CARDS_GONE" },
      { type: "DEALT" },
      { type: "RESET" },
      { type: "SHOWDOWN_REVEAL" },
    ] as const) {
      expect(applyCardEvent(armed, event)).toBe(armed);
    }
    expect(applyCardEvent(null, { type: "FOLD_DISARMED" })).toBeNull();
  });

  it("arms in the same move as the classification when the flick is fast enough", () => {
    const flick = moveGesture(
      press(),
      to(0, -(FOLD_THRESHOLD_PX + 100)),
      onTurn,
    );

    expect(flick.events).toEqual([
      { type: "CLASSIFIED", as: "FoldDragging" },
      { type: "FOLD_ARMED" },
    ]);
  });

  it("never arms a drag that is not a fold, however far up it goes", () => {
    const bending = moveGesture(
      press({ fromBendZone: true }),
      to(0, -10),
      onTurn,
    ).session;
    const ignored = moveGesture(press(), to(40, 0), onTurn).session;

    for (const session of [bending, ignored]) {
      const far = moveGesture(
        session,
        to(0, -(FOLD_THRESHOLD_PX + 200)),
        onTurn,
      );
      expect(far.events).not.toContainEqual({ type: "FOLD_ARMED" });
      expect(far.fold).toBeNull();
    }
  });
});

describe("endGesture", () => {
  function foldDragged(up: number): GestureSession {
    return moveGesture(press(), to(0, -up), onTurn).session;
  }

  it("taps on a release that never classified", () => {
    expect(endGesture(press(), { cancelled: false })).toEqual({
      events: [{ type: "RELEASED" }, { type: "TAPPED" }],
      commitsFold: false,
    });
  });

  it("does not tap on release from an ignored drag", () => {
    const ignored = moveGesture(press(), to(40, 0), onTurn).session;

    expect(endGesture(ignored, { cancelled: false })).toEqual({
      events: [{ type: "RELEASED" }],
      commitsFold: false,
    });
  });

  it("does not tap on release from a bend", () => {
    const bending = moveGesture(
      press({ fromBendZone: true }),
      to(-40, 0),
      onTurn,
    ).session;

    expect(endGesture(bending, { cancelled: false })).toEqual({
      events: [{ type: "RELEASED" }],
      commitsFold: false,
    });
  });

  it("cancels rather than taps when the browser takes the pointer away", () => {
    expect(endGesture(press(), { cancelled: true })).toEqual({
      events: [{ type: "CANCELLED" }],
      commitsFold: false,
    });
  });

  it("commits the Fold on the release that completes an armed drag", () => {
    expect(
      endGesture(foldDragged(FOLD_THRESHOLD_PX + 40), { cancelled: false })
        .commitsFold,
    ).toBe(true);
  });

  it("commits nothing from a drag that never reached the threshold", () => {
    expect(
      endGesture(foldDragged(FOLD_THRESHOLD_PX - 1), { cancelled: false })
        .commitsFold,
    ).toBe(false);
  });

  it("commits nothing when the browser takes the pointer away mid-flick", () => {
    expect(
      endGesture(foldDragged(FOLD_THRESHOLD_PX + 40), { cancelled: true }),
    ).toEqual({ events: [{ type: "CANCELLED" }], commitsFold: false });
  });

  it("agrees with the reducer about which releases fold", () => {
    for (const up of [
      FOLD_THRESHOLD_PX - 1,
      FOLD_THRESHOLD_PX,
      FOLD_THRESHOLD_PX + 200,
    ]) {
      const step = moveGesture(press(), to(0, -up), onTurn);
      const reduced = step.events.reduce(reduce, state("FaceDown", "Pressing"));

      expect(endGesture(step.session, { cancelled: false }).commitsFold).toBe(
        releaseCommitsFold(reduced),
      );
    }
  });
});
