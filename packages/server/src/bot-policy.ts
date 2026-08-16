import type { ActionType } from "@table-top-poker/protocol";

/** A source of values in the usual half-open random range [0, 1). */
export type BotRng = () => number;

/**
 * Action weights used by the default policy.  The weights are relative rather
 * than percentages because the policy receives a different set of legal
 * actions depending on whether the actor is facing a bet.
 *
 * A free check (or a call) is deliberately much more likely than folding or
 * raising, while fold and raise retain positive weights so every legal action
 * remains reachable.
 */
export const DEFAULT_BOT_ACTION_WEIGHTS: Readonly<Record<ActionType, number>> =
  Object.freeze({
    fold: 1,
    check: 12,
    call: 12,
    raise: 2,
  });

/** Default chance for a bot to skip the next hand between hands. */
export const DEFAULT_SIT_OUT_PROBABILITY = 0.1;

/** Default chance for a sitting-out bot to return for the next hand. */
export const DEFAULT_SIT_IN_PROBABILITY = 0.35;

/** The greatest representable JavaScript number below 1. */
const MAX_UNIT_RANDOM = 1 - Number.EPSILON / 2;

function unitRandom(rng: BotRng): number {
  const value = rng();

  // Math.random() is in [0, 1). Clamp invalid injected values to the nearest
  // boundary, but do not round a valid value in that range: MAX_UNIT_RANDOM
  // is itself a valid value and must remain unchanged.
  if (Number.isNaN(value)) return 0;
  return Math.min(Math.max(value, 0), MAX_UNIT_RANDOM);
}

function assertProbability(probability: number): void {
  if (!Number.isFinite(probability) || probability < 0 || probability > 1) {
    throw new RangeError(
      `probability must be a finite number between 0 and 1, got ${String(probability)}`,
    );
  }
}

/**
 * Chooses a currently legal action without consulting or mutating engine
 * state.  The caller supplies the engine's legal-action list; this function
 * only weights those entries and never derives a replacement list.
 */
export function chooseBotAction(
  legalActions: readonly ActionType[],
  rng: BotRng = Math.random,
): ActionType {
  if (legalActions.length === 0) {
    throw new RangeError("chooseBotAction needs at least one legal action");
  }

  const weights = legalActions.map(
    (action) => DEFAULT_BOT_ACTION_WEIGHTS[action],
  );
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  const target = unitRandom(rng) * total;

  let cumulative = 0;
  for (let index = 0; index < legalActions.length; index++) {
    cumulative += weights[index] ?? 0;
    if (target < cumulative) {
      const action = legalActions[index];
      if (action !== undefined) return action;
    }
  }

  // unitRandom() makes this unreachable for the normal action weights, but
  // retaining the final supplied entry protects the member-of-input contract
  // if the weighting table is changed later.
  const fallback = legalActions[legalActions.length - 1];
  if (fallback === undefined) {
    throw new Error("chooseBotAction lost its supplied legal action");
  }
  return fallback;
}

/** Returns whether a bot should sit out the next hand. */
export function shouldSitOut(
  rng: BotRng = Math.random,
  probability: number = DEFAULT_SIT_OUT_PROBABILITY,
): boolean {
  assertProbability(probability);
  return unitRandom(rng) < probability;
}

/** Returns whether a sitting-out bot should sit back in for the next hand. */
export function shouldSitIn(
  rng: BotRng = Math.random,
  probability: number = DEFAULT_SIT_IN_PROBABILITY,
): boolean {
  assertProbability(probability);
  return unitRandom(rng) < probability;
}
