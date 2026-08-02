import { describe, expect, it } from "vitest";
import { BEND_TRAVEL_PX, MOVE_SLOP_PX, REVEAL_THRESHOLD } from "./constants.js";
import {
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

const onTurn = { foldLegal: true };

/** Drag to an absolute point, from the origin `press()` uses. */
function to(dx: number, dy: number) {
  return { x: 100 + dx, y: 100 + dy };
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
    // The drag starts sideways — Ignored — then curves decisively upward.
    const slid = moveGesture(press(), to(-40, 0), onTurn);
    const curved = moveGesture(slid.session, to(-40, -400), onTurn);

    expect(slid.session.classification).toBe("Ignored");
    expect(curved.session.classification).toBe("Ignored");
    expect(curved.events).toEqual([]);
  });

  it("produces no events at all once classified, so a drag never re-renders", () => {
    // The guarantee behind "a finger drag causes zero React re-renders":
    // continuous values come back as `bend`, destined for a `MotionValue`, and
    // the reducer is never told that a finger moved.
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
    const offTurn = moveGesture(press(), to(0, -40), { foldLegal: false });
    expect(offTurn.session.classification).toBe("Ignored");

    // Legality returning mid-drag does not promote it.
    const later = moveGesture(offTurn.session, to(0, -400), onTurn);
    expect(later.session.classification).toBe("Ignored");
  });
});

describe("crossing the reveal threshold", () => {
  /** Inward travel, in px, that puts the peel at a given progress. */
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
      // Including dragging *back*: the commit happened on crossing, so it can
      // neither be undone nor re-announced.
      expect(step.events).toEqual([]);
      expect(step.session.crossed).toBe(true);
    }
  });

  it("stops driving the peel from the finger once committed", () => {
    // The turn owns the motion from the threshold on, so a finger still on the
    // glass cannot drag the card back out of a commit it already made.
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

    // Order matters: the reducer only accepts a crossing from `Bending`.
    expect(flick.events).toEqual([
      { type: "CLASSIFIED", as: "Bending" },
      { type: "BEND_CROSSED" },
    ]);
  });

  it("never commits a drag that is not a bend, however far it goes", () => {
    for (const session of [press(), press({ fromBendZone: false })]) {
      const dragged = moveGesture(session, to(0, inward(4)), onTurn);
      expect(dragged.events).toEqual([
        { type: "CLASSIFIED", as: "FoldDragging" },
      ]);
      expect(dragged.session.crossed).toBe(false);
    }
  });
});

describe("endGesture", () => {
  it("taps on a release that never classified", () => {
    expect(endGesture(press(), { cancelled: false })).toEqual([
      { type: "RELEASED" },
      { type: "TAPPED" },
    ]);
  });

  it("does not tap on release from an ignored drag", () => {
    const ignored = moveGesture(press(), to(40, 0), onTurn).session;

    expect(endGesture(ignored, { cancelled: false })).toEqual([
      { type: "RELEASED" },
    ]);
  });

  it("does not tap on release from a bend", () => {
    const bending = moveGesture(
      press({ fromBendZone: true }),
      to(-40, 0),
      onTurn,
    ).session;

    expect(endGesture(bending, { cancelled: false })).toEqual([
      { type: "RELEASED" },
    ]);
  });

  it("cancels rather than taps when the browser takes the pointer away", () => {
    expect(endGesture(press(), { cancelled: true })).toEqual([
      { type: "CANCELLED" },
    ]);
  });
});
