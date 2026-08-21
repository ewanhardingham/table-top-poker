import type { ActionType } from "@table-top-poker/protocol";

export type BotRng = () => number;

const BOT_ACTIONS = ["fold", "check", "call", "raise"] as const;

export type BotAction = (typeof BOT_ACTIONS)[number];

export const DEFAULT_BOT_ACTION_WEIGHTS: Readonly<Record<BotAction, number>> =
  Object.freeze({
    fold: 1,
    check: 12,
    call: 12,
    raise: 2,
  });

function isBotAction(action: ActionType): action is BotAction {
  return (BOT_ACTIONS as readonly ActionType[]).includes(action);
}

export const DEFAULT_SIT_OUT_PROBABILITY = 0.1;

export const DEFAULT_SIT_IN_PROBABILITY = 0.35;

const MAX_UNIT_RANDOM = 1 - Number.EPSILON / 2;

export function unitRandom(rng: BotRng): number {
  const value = rng();

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

export function chooseBotAction(
  legalActions: readonly ActionType[],
  rng: BotRng = Math.random,
): BotAction {
  const candidates = legalActions.filter(isBotAction);
  if (candidates.length === 0) {
    throw new RangeError("chooseBotAction needs at least one legal action");
  }

  const total = candidates.reduce(
    (sum, action) => sum + DEFAULT_BOT_ACTION_WEIGHTS[action],
    0,
  );
  const target = unitRandom(rng) * total;

  let cumulative = 0;
  for (const action of candidates) {
    cumulative += DEFAULT_BOT_ACTION_WEIGHTS[action];
    if (target < cumulative) return action;
  }

  throw new Error("chooseBotAction lost its supplied legal action");
}

function rollBelow(rng: BotRng, probability: number): boolean {
  assertProbability(probability);
  return unitRandom(rng) < probability;
}

export function shouldSitOut(
  rng: BotRng = Math.random,
  probability: number = DEFAULT_SIT_OUT_PROBABILITY,
): boolean {
  return rollBelow(rng, probability);
}

export function shouldSitIn(
  rng: BotRng = Math.random,
  probability: number = DEFAULT_SIT_IN_PROBABILITY,
): boolean {
  return rollBelow(rng, probability);
}
