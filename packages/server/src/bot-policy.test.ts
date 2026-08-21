import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  chooseBotAction,
  DEFAULT_BOT_ACTION_WEIGHTS,
  DEFAULT_SIT_IN_PROBABILITY,
  DEFAULT_SIT_OUT_PROBABILITY,
  shouldSitIn,
  shouldSitOut,
} from "./bot-policy.js";
import type { BotAction } from "./bot-policy.js";

const actionTypes: BotAction[] = ["fold", "check", "call", "raise"];
const greatestRollBelowOne = 0.9999999999999999;

const legalActionsArb = fc.subarray(actionTypes, { minLength: 1 });

describe("chooseBotAction", () => {
  it("returns an entry from the supplied legal actions", () => {
    for (const legalActions of [
      ["fold", "check", "raise"],
      ["fold", "call", "raise"],
      ["fold"],
    ] as const) {
      expect(legalActions).toContain(chooseBotAction(legalActions, () => 0.5));
    }
  });

  it("is deterministic under an injected RNG", () => {
    const legalActions = ["fold", "check", "raise"] as const;
    expect(chooseBotAction(legalActions, () => 0.2)).toBe(
      chooseBotAction(legalActions, () => 0.2),
    );
  });

  it("keeps a facing bet alive while reaching call, fold, and raise", () => {
    const legalActions = ["fold", "call", "raise"] as const;
    const reached = new Set<BotAction>();
    let folds = 0;
    let calls = 0;
    for (let i = 0; i < 10_000; i++) {
      const action = chooseBotAction(legalActions, () => (i + 0.5) / 10_000);
      reached.add(action);
      if (action === "fold") folds++;
      if (action === "call") calls++;
    }

    expect(reached).toEqual(new Set(legalActions));
    expect(calls).toBeGreaterThan(folds * 5);
  });

  it("keeps every action weight positive and immutable at runtime", () => {
    for (const action of actionTypes) {
      expect(DEFAULT_BOT_ACTION_WEIGHTS[action]).toBeGreaterThan(0);
    }
    expect(Object.isFrozen(DEFAULT_BOT_ACTION_WEIGHTS)).toBe(true);
  });

  it("keeps a free check overwhelmingly more likely than folding", () => {
    const legalActions = ["fold", "check", "raise"] as const;
    let folds = 0;
    let checks = 0;
    for (let i = 0; i < 10_000; i++) {
      const action = chooseBotAction(legalActions, () => (i + 0.5) / 10_000);
      if (action === "fold") folds++;
      if (action === "check") checks++;
    }

    expect(folds).toBeGreaterThan(0);
    expect(checks).toBeGreaterThan(folds * 5);
  });

  it("leaves every supplied action reachable", () => {
    const legalActions = ["fold", "check", "raise"] as const;
    const reached = new Set<BotAction>();
    for (let i = 0; i < 10_000; i++) {
      reached.add(chooseBotAction(legalActions, () => (i + 0.5) / 10_000));
    }
    expect(reached).toEqual(new Set(legalActions));
  });

  it("never declares an all-in, however the RNG falls", () => {
    const legalActions = [
      "fold",
      "call",
      "raise",
      "allInCall",
      "allInRaise",
    ] as const;
    for (let i = 0; i < 1000; i++) {
      const action = chooseBotAction(legalActions, () => (i + 0.5) / 1000);
      expect(actionTypes).toContain(action);
    }
  });

  it("rejects a legal-action list with nothing a bot will play", () => {
    expect(() => chooseBotAction(["allInRaise"], () => 0)).toThrow(RangeError);
  });

  it("rejects an empty legal-action list", () => {
    expect(() => chooseBotAction([], () => 0)).toThrow(RangeError);
  });

  it("always returns a legal action for every nonempty legal-action set", () => {
    fc.assert(
      fc.property(
        legalActionsArb,
        fc.double({ min: 0, max: 1, noNaN: true }),
        (legalActions, randomValue) => {
          const action = chooseBotAction(legalActions, () => randomValue);
          expect(legalActions).toContain(action);
        },
      ),
    );
  });
});

describe("sit-out/in rolls", () => {
  it("honours configured probability boundaries", () => {
    expect(shouldSitOut(() => 0, 0)).toBe(false);
    expect(shouldSitOut(() => 0, 1)).toBe(true);
    expect(shouldSitIn(() => 0, 0)).toBe(false);
    expect(shouldSitIn(() => 0, 1)).toBe(true);
  });

  it("uses sane nontrivial defaults", () => {
    expect(DEFAULT_SIT_OUT_PROBABILITY).toBeGreaterThan(0);
    expect(DEFAULT_SIT_OUT_PROBABILITY).toBeLessThan(1);
    expect(DEFAULT_SIT_IN_PROBABILITY).toBeGreaterThan(0);
    expect(DEFAULT_SIT_IN_PROBABILITY).toBeLessThan(1);
  });

  it("is deterministic under an injected RNG", () => {
    expect(shouldSitOut(() => 0.09)).toBe(shouldSitOut(() => 0.09));
    expect(shouldSitIn(() => 0.34)).toBe(shouldSitIn(() => 0.34));
  });

  it("satisfies the configured probability decision for every roll", () => {
    fc.assert(
      fc.property(
        fc.double({ min: 0, max: greatestRollBelowOne, noNaN: true }),
        fc.float({ min: 0, max: 1, noNaN: true }),
        (randomValue, probability) => {
          expect(shouldSitOut(() => randomValue, probability)).toBe(
            randomValue < probability,
          );
          expect(shouldSitIn(() => randomValue, probability)).toBe(
            randomValue < probability,
          );
        },
      ),
    );
  });

  it("preserves the greatest valid roll and uses strict less-than semantics", () => {
    expect(shouldSitOut(() => greatestRollBelowOne, greatestRollBelowOne)).toBe(
      false,
    );
    expect(shouldSitIn(() => greatestRollBelowOne, greatestRollBelowOne)).toBe(
      false,
    );
    expect(shouldSitOut(() => greatestRollBelowOne, 1)).toBe(true);
    expect(shouldSitIn(() => greatestRollBelowOne, 1)).toBe(true);
  });

  it("rejects probabilities outside the unit interval", () => {
    expect(() => shouldSitOut(() => 0, -0.01)).toThrow(RangeError);
    expect(() => shouldSitIn(() => 0, 1.01)).toThrow(RangeError);
  });
});
