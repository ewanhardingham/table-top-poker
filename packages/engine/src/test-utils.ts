import { apply } from "./apply.js";
import { decide } from "./decide.js";
import type { Command, EngineState, HandEvent, Rejection } from "./types.js";

/** Runs one command, folding any resulting events into state via `apply`. */
export function play(
  state: EngineState,
  command: Command,
):
  | { state: EngineState; events: HandEvent[] }
  | { state: EngineState; rejection: Rejection } {
  const result = decide(state, command);
  if (!Array.isArray(result)) {
    return { state, rejection: result };
  }
  let next = state;
  for (const event of result) {
    next = apply(next, event);
  }
  return { state: next, events: result };
}

/** Runs a sequence of commands, throwing on the first rejection. */
export function playAll(state: EngineState, commands: Command[]): EngineState {
  let current = state;
  for (const command of commands) {
    const outcome = play(current, command);
    if ("rejection" in outcome) {
      throw new Error(
        `unexpected rejection for ${JSON.stringify(command)}: ${outcome.rejection.reason}`,
      );
    }
    current = outcome.state;
  }
  return current;
}
