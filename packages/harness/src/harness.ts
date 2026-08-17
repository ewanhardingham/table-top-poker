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
  readonly log?: HandLog;
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
  const lines = createInterface({
    input: options.input,
    crlfDelay: Infinity,
  });

  for await (const line of lines) {
    if (line.trim() === "") continue;

    const command = parseCommand(line);
    options.log?.logCommand(command);
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
