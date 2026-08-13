import { createInterface } from "node:readline";
import type { Readable, Writable } from "node:stream";
import { apply, decide } from "@table-top-poker/engine";
import type {
  Command,
  EngineState,
  HandEvent,
  Rejection,
} from "@table-top-poker/engine";
import { handStartContextFor } from "@table-top-poker/recording";
import type { RoomRecording } from "@table-top-poker/recording";

export interface RunHarnessOptions {
  readonly state: EngineState;
  readonly input: Readable;
  readonly output: Writable;
  /** Optional Room recording — see Phase 2 spec #129 §3, "The harness writes the same layout". */
  readonly recording?: RoomRecording;
  /** Overridable for tests; the recording's only clock. */
  readonly now?: () => Date;
}

function parseCommand(line: string): Command {
  try {
    return JSON.parse(line) as Command;
  } catch (cause) {
    throw new Error(`invalid JSON on harness input: ${line}`, { cause });
  }
}

export async function runHarness(options: RunHarnessOptions): Promise<void> {
  let state = options.state;
  const now = options.now ?? (() => new Date());
  const lines = createInterface({
    input: options.input,
    crlfDelay: Infinity,
  });

  for await (const line of lines) {
    if (line.trim() === "") continue;

    const command = parseCommand(line);
    const result = decide(state, command) as
      HandEvent[] | Rejection | undefined;
    if (result === undefined) {
      throw new Error(`unrecognized command on harness input: ${line}`);
    }

    if (!Array.isArray(result)) {
      await options.recording?.append({ command, outcome: result });
      options.output.write(JSON.stringify(result) + "\n");
      continue;
    }

    // The whole operation is recorded as one unit, so the Hand context has to
    // be resolved before any of it is written — which means folding the
    // events into state first, then writing, then emitting.
    for (const event of result) {
      state = apply(state, event);
    }
    const context = handStartContextFor(result, state, now);
    await options.recording?.append({
      ...(context === undefined ? {} : { context }),
      command,
      outcome: result,
    });
    for (const event of result) {
      options.output.write(JSON.stringify(event) + "\n");
    }
  }
}
