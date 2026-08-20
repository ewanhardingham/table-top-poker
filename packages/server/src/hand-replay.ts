import { replayHand, view } from "@table-top-poker/protocol";
import type { TableReplayPosition } from "@table-top-poker/protocol";
import type { HandRecordingRead } from "@table-top-poker/recording";
import { redactEventFor } from "./redact-event.js";

/** `diagnostic` is for the operational log; the table only ever sees `hand-unavailable`. */
export type TableHandReplay =
  | {
      readonly status: "replayed";
      readonly positions: readonly TableReplayPosition[];
    }
  | { readonly status: "unavailable"; readonly diagnostic: string };

/** The server's replay adapter — see Secrecy in `docs/design/server.md`. */
export function tableReplayOf(read: HandRecordingRead): TableHandReplay {
  if (read.status === "missing-file") {
    return { status: "unavailable", diagnostic: `missing ${read.file}` };
  }
  if (read.status === "malformed-record") {
    return {
      status: "unavailable",
      diagnostic: `malformed record at ${read.file}:${String(read.line)}`,
    };
  }

  const outcome = replayHand(read.input);
  if (outcome.status === "failed") {
    return {
      status: "unavailable",
      diagnostic: `replay failed: ${JSON.stringify(outcome.failure)}`,
    };
  }
  if (outcome.status === "incomplete") {
    return {
      status: "unavailable",
      diagnostic: `replay incomplete: ${JSON.stringify({
        tornRecord: outcome.tornRecord,
        orphanedCommand: outcome.orphanedCommand,
      })}`,
    };
  }

  return {
    status: "replayed",
    positions: outcome.positions.map((position) => ({
      event:
        position.event === null
          ? null
          : redactEventFor(position.event, "table"),
      view: view(position.state, "table"),
    })),
  };
}
