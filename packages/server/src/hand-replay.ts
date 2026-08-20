import { replayHand, view } from "@table-top-poker/protocol";
import type { TableReplayPosition } from "@table-top-poker/protocol";
import type { HandRecordingRead } from "@table-top-poker/recording";
import { redactEventFor } from "./redact-event.js";

/**
 * A replayed Hand, or the reason it cannot be served. The reason never
 * reaches the table — a `hand-unavailable` rejection says only that much —
 * so `diagnostic` exists for the operational log, where filesystem and
 * corruption detail belongs (Phase 2 spec #129 §3).
 */
export type TableHandReplay =
  | {
      readonly status: "replayed";
      readonly positions: readonly TableReplayPosition[];
    }
  | { readonly status: "unavailable"; readonly diagnostic: string };

/**
 * Turns one read Hand recording into the positions the table may see.
 *
 * This is the server's whole replay adapter, and the boundary the visibility
 * guarantee rests on: the engine's flipbook carries complete `EngineState`,
 * and every position leaves here projected through `view(state, "table")`
 * into a protocol type that cannot hold one (§7). It takes no audience,
 * redaction option or `revealEverything` flag, and there is no other way out
 * of the engine's replay on this side of the wire. Each position's Event goes
 * through the same `redactEventFor` the live fan-out uses, so the table is
 * shown exactly what it was shown live and no more.
 *
 * Only a `complete` replay is served. An incomplete one — a torn tail, or a
 * Command with no recorded outcome — is refused rather than truncated: the
 * picker must not offer such a Hand at all (§4), so one arriving here means
 * the listing and the recording have already disagreed.
 */
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
