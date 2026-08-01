import { createInterface } from "node:readline";
import type { Readable, Writable } from "node:stream";
import { apply, decide } from "@table-top-poker/engine";
import type {
  Command,
  EngineState,
  HandEvent,
  Rejection,
} from "@table-top-poker/engine";
import type { HandLog } from "./persistence.js";

export interface RunHarnessOptions {
  readonly state: EngineState;
  readonly input: Readable;
  readonly output: Writable;
  /** Optional append-as-you-go persistence — see Phase 1 spec #130 §5. */
  readonly log?: HandLog;
}

// A logged command line carries an extra `v` field (see persistence.ts's
// `LoggedCommand`) but is otherwise a bare `Command` — decide() only reads
// the fields it knows about, so the extra field is silently ignored and a
// persisted command log re-pipes through the harness unmodified.
function parseCommand(line: string): Command {
  try {
    return JSON.parse(line) as Command;
  } catch (cause) {
    throw new Error(`invalid JSON on harness input: ${line}`, { cause });
  }
}

/**
 * Line-delimited harness over the engine: one JSON command per input line,
 * one JSON event or rejection per output line, folding each event into
 * state via `apply` as it's produced. A recorded hand is its input command
 * stream, not this output — replay means re-piping that file.
 *
 * Input is untrusted (hand-typed or agent-generated), unlike every other
 * caller of `decide`, whose closed `Command` union is only enforced at
 * compile time — a bad line fails the whole run rather than risk silently
 * corrupting the audit stream.
 */
export async function runHarness(options: RunHarnessOptions): Promise<void> {
  let state = options.state;
  const lines = createInterface({
    input: options.input,
    crlfDelay: Infinity,
  });

  for await (const line of lines) {
    if (line.trim() === "") continue;

    const command = parseCommand(line);
    options.log?.logCommand(command);
    // decide()'s Command union is exhaustive only at compile time; this
    // input is untrusted JSON, so an unrecognized `type` falls off the
    // engine's switch at runtime and returns undefined, not a type error.
    const result = decide(state, command) as
      HandEvent[] | Rejection | undefined;
    if (result === undefined) {
      throw new Error(`unrecognized command on harness input: ${line}`);
    }

    if (!Array.isArray(result)) {
      options.log?.logEvent(result);
      options.output.write(JSON.stringify(result) + "\n");
      continue;
    }

    for (const event of result) {
      state = apply(state, event);
      options.log?.logEvent(event);
      options.output.write(JSON.stringify(event) + "\n");
    }
  }
}
