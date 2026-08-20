import { apply } from "./apply.js";
import { decide } from "./decide.js";
import type {
  Command,
  EngineState,
  HandEvent,
  Rejection,
  SeatId,
} from "./types.js";
import { must } from "./util.js";
import { ENGINE_LOG_VERSION } from "./version.js";

/** Hand context (`CONTEXT.md`), narrowed to what the engine bootstraps from. */
export interface ReplayHandContext {
  readonly v: number;
  readonly seats: readonly SeatId[];
  readonly button: SeatId;
}

/** One persisted Command line: the bare `Command` plus its version tag. */
export type ReplayCommandRecord = Command & { readonly v: number };

/** One persisted audit line: a `HandEvent` or `Rejection` plus its version tag. */
export type ReplayAuditRecord = (HandEvent | Rejection) & {
  readonly v: number;
};

/** Stream names for diagnostics; Replay never opens them. */
export interface ReplaySources {
  readonly context: string;
  readonly commands: string;
  readonly events: string;
}

/** A clearly torn final JSONL record the caller's reader discarded. */
export interface ReplayTornRecord {
  readonly file: string;
  readonly line: number;
}

export interface ReplayInput {
  readonly sources: ReplaySources;
  readonly context: ReplayHandContext;
  readonly commands: readonly ReplayCommandRecord[];
  /** The persisted Event/`Rejection` stream, as audit evidence. */
  readonly events: readonly ReplayAuditRecord[];
  readonly tornRecord?: ReplayTornRecord | null;
}

/**
 * See Replay position in `CONTEXT.md`. State is carried whole, never as a
 * view: `FoldedOutView` has no board, so a fold-out's board would be lost.
 */
export interface ReplayPosition {
  readonly position: number;
  readonly event: HandEvent | null;
  readonly state: EngineState;
}

/** A validated Rejection: it creates no position, only names the one it hit. */
export interface ReplayRejection {
  readonly position: number;
  readonly record: number;
  readonly rejection: Rejection;
}

export interface ReplayFlipbook {
  readonly positions: readonly ReplayPosition[];
  readonly rejections: readonly ReplayRejection[];
}

export type ReplayFailure =
  | {
      readonly kind: "unsupported-version";
      readonly expected: number;
      readonly actual: number;
      readonly file: string;
      /** The record's ordinal in its file; null for the single-record context. */
      readonly record: number | null;
    }
  | {
      readonly kind: "invalid-context";
      readonly reason: "button-not-seated" | "seat-count-out-of-range";
      readonly file: string;
    }
  | {
      readonly kind: "invalid-command-log";
      readonly reason: "empty" | "does-not-start-a-hand";
      readonly file: string;
    }
  | {
      readonly kind: "record-mismatch";
      /** The first differing record's ordinal in the audit stream. */
      readonly record: number;
      /** Null when the persisted stream runs past what the Commands generate. */
      readonly generated: HandEvent | Rejection | null;
      readonly persisted: HandEvent | Rejection | null;
      readonly file: string;
    };

export type ReplayOutcome =
  | ({ readonly status: "complete" } & ReplayFlipbook)
  | ({
      readonly status: "incomplete";
      readonly tornRecord: ReplayTornRecord | null;
      /** Where replay stopped; null when only a torn record ended it. */
      readonly orphanedCommand: number | null;
    } & ReplayFlipbook)
  | { readonly status: "failed"; readonly failure: ReplayFailure };

/**
 * Replays one recorded Hand into an addressable flipbook — see Replay in
 * `CONTEXT.md`. The Command log is the source of truth; persisted records are
 * compared against, never trusted, repaired or substituted.
 */
export function replayHand(input: ReplayInput): ReplayOutcome {
  const versionFailure = firstVersionMismatch(input);
  if (versionFailure !== null) {
    return { status: "failed", failure: versionFailure };
  }

  const contextFailure = validateContext(input.context, input.sources.context);
  if (contextFailure !== null) {
    return { status: "failed", failure: contextFailure };
  }

  const commandFailure = validateCommandLog(
    input.commands,
    input.sources.commands,
  );
  if (commandFailure !== null) {
    return { status: "failed", failure: commandFailure };
  }

  // Replay builds its own starting state: `createInitialState` hard-codes the
  // button to `seats[0]`, and a general "state at an arbitrary Button" export
  // would weaken that invariant for every live caller.
  let state: EngineState = {
    seats: [...input.context.seats],
    button: input.context.button,
    hand: null,
  };
  const positions: ReplayPosition[] = [{ position: 0, event: null, state }];
  const rejections: ReplayRejection[] = [];
  let audit = 0;

  for (const [ordinal, commandRecord] of input.commands.entries()) {
    const command =
      ordinal === 0
        ? openingCommand(commandRecord)
        : bareCommand(commandRecord);
    const outcome = decide(state, command);
    const generated = Array.isArray(outcome)
      ? outcome
      : [asRecorded(outcome, commandRecord)];

    // Whatever evidence survives is compared before anything is concluded
    // from its length: a truncated operation is only *incomplete* when the
    // records that did survive agree. One that contradicts them is corrupt.
    const corroborated = Math.min(
      generated.length,
      input.events.length - audit,
    );
    for (let offset = 0; offset < corroborated; offset += 1) {
      const item = must(generated[offset]);
      const persisted = withoutVersion(must(input.events[audit + offset]));
      if (!equal(item, persisted)) {
        return {
          status: "failed",
          failure: {
            kind: "record-mismatch",
            record: audit + offset,
            generated: item,
            persisted,
            file: input.sources.events,
          },
        };
      }
    }

    // Only a fully corroborated operation is committed: a half-recorded one
    // leaves the flipbook at the last complete position rather than applying
    // events no audit record backs.
    if (corroborated < generated.length) {
      return {
        status: "incomplete",
        positions,
        rejections,
        tornRecord: input.tornRecord ?? null,
        orphanedCommand: ordinal,
      };
    }

    for (const [offset, item] of generated.entries()) {
      if (item.type === "Rejection") {
        rejections.push({
          position: positions.length - 1,
          record: audit + offset,
          rejection: item,
        });
        continue;
      }
      state = apply(state, item);
      positions.push({ position: positions.length, event: item, state });
    }
    audit += generated.length;
  }

  const trailing = input.events[audit];
  if (trailing !== undefined) {
    return {
      status: "failed",
      failure: {
        kind: "record-mismatch",
        record: audit,
        generated: null,
        persisted: withoutVersion(trailing),
        file: input.sources.events,
      },
    };
  }

  if (input.tornRecord != null) {
    return {
      status: "incomplete",
      positions,
      rejections,
      tornRecord: input.tornRecord,
      orphanedCommand: null,
    };
  }

  return { status: "complete", positions, rejections };
}

/** See Replay in `docs/design/engine.md`. */
function openingCommand(record: ReplayCommandRecord): Command {
  const command = bareCommand(record);
  if (command.type === "nextHand") {
    return { type: "startHand", seatId: command.seatId, seed: command.seed };
  }
  return command;
}

/** See Replay in `docs/design/engine.md`. */
function asRecorded(
  rejection: Rejection,
  record: ReplayCommandRecord,
): Rejection {
  return { ...rejection, command: bareCommand(record) };
}

function bareCommand(record: ReplayCommandRecord): Command {
  const { v, ...command } = record;
  void v;
  return command;
}

function withoutVersion(record: ReplayAuditRecord): HandEvent | Rejection {
  const { v, ...rest } = record;
  void v;
  return rest;
}

function firstVersionMismatch(input: ReplayInput): ReplayFailure | null {
  const mismatch = (
    actual: number,
    file: string,
    record: number | null,
  ): ReplayFailure => ({
    kind: "unsupported-version",
    expected: ENGINE_LOG_VERSION,
    actual,
    file,
    record,
  });

  if (input.context.v !== ENGINE_LOG_VERSION) {
    return mismatch(input.context.v, input.sources.context, null);
  }
  for (const [ordinal, command] of input.commands.entries()) {
    if (command.v !== ENGINE_LOG_VERSION) {
      return mismatch(command.v, input.sources.commands, ordinal);
    }
  }
  for (const [ordinal, event] of input.events.entries()) {
    if (event.v !== ENGINE_LOG_VERSION) {
      return mismatch(event.v, input.sources.events, ordinal);
    }
  }
  return null;
}

/** Checked here so a bad Button fails as an invalid context, not inside `rotateFromButton`. */
function validateContext(
  context: ReplayHandContext,
  file: string,
): ReplayFailure | null {
  if (context.seats.length < 2 || context.seats.length > 8) {
    return { kind: "invalid-context", reason: "seat-count-out-of-range", file };
  }
  if (!context.seats.includes(context.button)) {
    return { kind: "invalid-context", reason: "button-not-seated", file };
  }
  return null;
}

function validateCommandLog(
  commands: readonly ReplayCommandRecord[],
  file: string,
): ReplayFailure | null {
  const first = commands[0];
  if (first === undefined) {
    return { kind: "invalid-command-log", reason: "empty", file };
  }
  if (first.type !== "startHand" && first.type !== "nextHand") {
    return {
      kind: "invalid-command-log",
      reason: "does-not-start-a-hand",
      file,
    };
  }
  return null;
}

/** Structural, not `JSON.stringify`: key order is not what an audit rests on. */
function equal(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (Array.isArray(a) || Array.isArray(b)) {
    return (
      Array.isArray(a) &&
      Array.isArray(b) &&
      a.length === b.length &&
      a.every((item, index) => equal(item, b[index]))
    );
  }
  if (
    typeof a !== "object" ||
    typeof b !== "object" ||
    a === null ||
    b === null
  ) {
    return false;
  }
  const left = a as Record<string, unknown>;
  const right = b as Record<string, unknown>;
  const keys = Object.keys(left);
  return (
    keys.length === Object.keys(right).length &&
    keys.every(
      (key) =>
        Object.prototype.hasOwnProperty.call(right, key) &&
        equal(left[key], right[key]),
    )
  );
}
