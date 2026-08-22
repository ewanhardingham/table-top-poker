import { describe, expect, it } from "vitest";
import type { Classification } from "./classify.js";
import { DOUBLE_TAP_MS } from "./constants.js";
import { endGesture, type GestureSession } from "./gesture.js";
import { planFinish, type FinishEffect } from "./finishPlan.js";
import type { CardActions } from "./ports.js";

function session(over: Partial<GestureSession>): GestureSession {
  return {
    pointerId: 1,
    originX: 0,
    originY: 0,
    fromBendZone: false,
    startedRevealed: false,
    classification: null,
    crossed: false,
    armed: false,
    ...over,
  };
}

const armedFold = session({
  classification: "FoldDragging" satisfies Classification,
  armed: true,
});

const tap = session({ classification: null });

type PlanActions = Pick<
  CardActions,
  "foldLegal" | "checkLegal" | "muckLegal" | "pending"
>;

const open: PlanActions = {
  foldLegal: true,
  checkLegal: true,
  muckLegal: false,
  pending: false,
};

const dispatched = (effects: readonly FinishEffect[]) =>
  effects.flatMap((e) => (e.kind === "dispatch" ? [e.event.type] : []));

const sent = (effects: readonly FinishEffect[]) =>
  effects.flatMap((e) => (e.kind === "send" ? [e.action] : []));

describe("planFinish — Fold", () => {
  it("commits the Fold when the release is armed and Fold is legal", () => {
    const plan = planFinish({
      end: endGesture(armedFold, { cancelled: false }),
      actions: open,
      presentation: "FaceDown",
      tapWindow: null,
      now: 1000,
    });

    expect(sent(plan.effects)).toEqual(["fold"]);
    expect(plan.leaving).toEqual({ faceUp: false });
  });

  it("departs before the Fold leaves the module (§7)", () => {
    const { effects } = planFinish({
      end: endGesture(armedFold, { cancelled: false }),
      actions: open,
      presentation: "FaceDown",
      tapWindow: null,
      now: 1000,
    });

    const released = effects.findIndex(
      (e) => e.kind === "dispatch" && e.event.type === "RELEASED",
    );
    const fold = effects.findIndex(
      (e) => e.kind === "send" && e.action === "fold",
    );
    expect(released).toBeGreaterThanOrEqual(0);
    expect(released).toBeLessThan(fold);
  });

  it.each([
    ["Revealed" as const, true],
    ["Turning" as const, true],
    ["FaceDown" as const, false],
    ["Peeking" as const, false],
  ])("leaves face-up from %s: %s", (presentation, faceUp) => {
    const plan = planFinish({
      end: endGesture(armedFold, { cancelled: false }),
      actions: open,
      presentation,
      tapWindow: null,
      now: 1000,
    });
    expect(plan.leaving).toEqual({ faceUp });
  });

  it("disarms rather than sending when Fold turned illegal under the drag (§6)", () => {
    const plan = planFinish({
      end: endGesture(armedFold, { cancelled: false }),
      actions: { ...open, foldLegal: false },
      presentation: "FaceDown",
      tapWindow: null,
      now: 1000,
    });

    expect(sent(plan.effects)).toEqual([]);
    expect(plan.leaving).toBeNull();
    expect(dispatched(plan.effects)).toEqual(["FOLD_DISARMED", "RELEASED"]);
  });

  it("does not send a Fold on top of an Action already in flight", () => {
    const plan = planFinish({
      end: endGesture(armedFold, { cancelled: false }),
      actions: { ...open, pending: true },
      presentation: "FaceDown",
      tapWindow: null,
      now: 1000,
    });

    expect(sent(plan.effects)).toEqual([]);
    expect(dispatched(plan.effects)).toEqual(["FOLD_DISARMED", "RELEASED"]);
  });

  it("commits nothing on a cancelled release, however far it was carried", () => {
    const plan = planFinish({
      end: endGesture(armedFold, { cancelled: true }),
      actions: open,
      presentation: "FaceDown",
      tapWindow: null,
      now: 1000,
    });

    expect(sent(plan.effects)).toEqual([]);
    expect(plan.leaving).toBeNull();
    expect(dispatched(plan.effects)).toEqual(["CANCELLED"]);
  });
});

describe("planFinish — Check", () => {
  it("opens the tap window on the first tap and sends nothing", () => {
    const plan = planFinish({
      end: endGesture(tap, { cancelled: false }),
      actions: open,
      presentation: "FaceDown",
      tapWindow: null,
      now: 1000,
    });

    expect(sent(plan.effects)).toEqual([]);
    expect(dispatched(plan.effects)).toEqual(["RELEASED", "TAPPED"]);
    expect(plan.nextTapWindow).toBe(1000);
  });

  it("sends the Check on a second tap inside the window", () => {
    const plan = planFinish({
      end: endGesture(tap, { cancelled: false }),
      actions: open,
      presentation: "FaceDown",
      tapWindow: 1000,
      now: 1000 + DOUBLE_TAP_MS,
    });

    expect(sent(plan.effects)).toEqual(["check"]);
    expect(plan.nextTapWindow).toBeNull();
    expect(plan.confirmCheck).toBe(true);
  });

  it("conceals before the Check leaves the module (story 31)", () => {
    const { effects } = planFinish({
      end: endGesture(tap, { cancelled: false }),
      actions: open,
      presentation: "FaceDown",
      tapWindow: 1000,
      now: 1000 + DOUBLE_TAP_MS,
    });

    const doubleTapped = effects.findIndex(
      (e) => e.kind === "dispatch" && e.event.type === "DOUBLE_TAPPED",
    );
    const check = effects.findIndex(
      (e) => e.kind === "send" && e.action === "check",
    );
    expect(doubleTapped).toBeGreaterThanOrEqual(0);
    expect(doubleTapped).toBeLessThan(check);
  });

  it("still sends the Check off-turn but claims nothing (canAct is the gate)", () => {
    const plan = planFinish({
      end: endGesture(tap, { cancelled: false }),
      actions: { ...open, checkLegal: false },
      presentation: "FaceDown",
      tapWindow: 1000,
      now: 1000 + DOUBLE_TAP_MS,
    });

    expect(sent(plan.effects)).toEqual(["check"]);
    expect(plan.confirmCheck).toBe(false);
  });

  it("claims nothing while an Action is already in flight", () => {
    const plan = planFinish({
      end: endGesture(tap, { cancelled: false }),
      actions: { ...open, pending: true },
      presentation: "FaceDown",
      tapWindow: 1000,
      now: 1000 + DOUBLE_TAP_MS,
    });

    expect(sent(plan.effects)).toEqual(["check"]);
    expect(plan.confirmCheck).toBe(false);
  });
});

describe("planFinish — the tap window closes on any non-tap ending (§5)", () => {
  it("closes an open window on a bend, so tap → peek → tap composes no Check", () => {
    const bend = session({ classification: "Bending" });
    const plan = planFinish({
      end: endGesture(bend, { cancelled: false }),
      actions: open,
      presentation: "Peeking",
      tapWindow: 1000,
      now: 1100,
    });

    expect(sent(plan.effects)).toEqual([]);
    expect(plan.nextTapWindow).toBeNull();
  });

  it("closes an open window on a committed Fold", () => {
    const plan = planFinish({
      end: endGesture(armedFold, { cancelled: false }),
      actions: open,
      presentation: "FaceDown",
      tapWindow: 1000,
      now: 1100,
    });

    expect(plan.nextTapWindow).toBeNull();
  });

  it("closes an open window on a cancelled press", () => {
    const plan = planFinish({
      end: endGesture(tap, { cancelled: true }),
      actions: open,
      presentation: "FaceDown",
      tapWindow: 1000,
      now: 1100,
    });

    expect(plan.nextTapWindow).toBeNull();
  });
});

describe("planFinish — Muck", () => {
  const showdown: PlanActions = {
    foldLegal: false,
    checkLegal: false,
    muckLegal: true,
    pending: false,
  };

  it("sends a muck for the same armed upward drag that folds", () => {
    const plan = planFinish({
      end: endGesture(armedFold, { cancelled: false }),
      actions: showdown,
      presentation: "FaceDown",
      tapWindow: null,
      now: 1000,
    });

    expect(sent(plan.effects)).toEqual(["muck"]);
    expect(plan.leaving).toEqual({ faceUp: false });
  });

  it("disarms rather than mucking while the compulsion stands", () => {
    const plan = planFinish({
      end: endGesture(armedFold, { cancelled: false }),
      actions: { ...showdown, muckLegal: false },
      presentation: "FaceDown",
      tapWindow: null,
      now: 1000,
    });

    expect(sent(plan.effects)).toEqual([]);
    expect(dispatched(plan.effects)).toContain("FOLD_DISARMED");
    expect(plan.leaving).toBeNull();
  });
});
