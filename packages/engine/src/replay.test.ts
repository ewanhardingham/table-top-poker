import { describe, expect, it } from "vitest";
import { apply } from "./apply.js";
import { replayHand } from "./replay.js";
import type {
  ReplayAuditRecord,
  ReplayCommandRecord,
  ReplayHandContext,
  ReplayInput,
  ReplaySources,
} from "./replay.js";
import { play } from "./test-utils.js";
import type { Command, EngineState, HandEvent, Rejection } from "./types.js";
import { must } from "./util.js";
import { ENGINE_LOG_VERSION } from "./version.js";

const sources: ReplaySources = {
  context: "hand-0001.context.json",
  commands: "hand-0001.commands.jsonl",
  events: "hand-0001.events.jsonl",
};

interface Recording {
  readonly context: ReplayHandContext;
  readonly commands: ReplayCommandRecord[];
  readonly events: ReplayAuditRecord[];
}

/**
 * Stands in for a live run and the recorder watching it: plays `commands`
 * from `state` exactly as the server does, and captures the Hand context,
 * Command log and Event/`Rejection` audit stream a recording would hold.
 */
function record(
  state: EngineState,
  commands: readonly Command[],
): { recording: Recording; state: EngineState } {
  const recording: Recording = {
    context: {
      v: ENGINE_LOG_VERSION,
      seats: [...state.seats],
      button: state.button,
    },
    commands: [],
    events: [],
  };
  let current = state;
  for (const command of commands) {
    recording.commands.push({ ...command, v: ENGINE_LOG_VERSION });
    const outcome = play(current, command);
    const generated =
      "rejection" in outcome ? [outcome.rejection] : outcome.events;
    for (const item of generated) {
      recording.events.push({ ...item, v: ENGINE_LOG_VERSION });
    }
    current = outcome.state;
  }
  return { recording, state: current };
}

function inputFrom(
  recording: Recording,
  overrides: Partial<ReplayInput> = {},
): ReplayInput {
  return { sources, ...recording, ...overrides };
}

/** A three-seat hand that runs preflop to a fold-out, button on seat 0. */
function foldOutHand(): Recording {
  const start: EngineState = { seats: [0, 1, 2], button: 0, hand: null };
  return record(start, [
    { type: "startHand", seatId: 0, seed: "replay-seed" },
    { type: "fold", seatId: 0 },
    { type: "fold", seatId: 1 },
  ]).recording;
}

describe("replayHand: the flipbook", () => {
  it("makes position 0 the starting state with no event", () => {
    const outcome = replayHand(inputFrom(foldOutHand()));

    expect(outcome.status).toBe("complete");
    if (outcome.status !== "complete") return;
    const first = outcome.positions[0];
    expect(first).toEqual({
      position: 0,
      event: null,
      state: { seats: [0, 1, 2], button: 0, hand: null },
    });
  });

  it("carries the nth generated event and the complete state after applying it", () => {
    const recording = foldOutHand();
    const outcome = replayHand(inputFrom(recording));

    expect(outcome.status).toBe("complete");
    if (outcome.status !== "complete") return;

    const persistedEvents = recording.events.map(({ v, ...rest }) => {
      void v;
      return rest as HandEvent;
    });
    expect(outcome.positions).toHaveLength(persistedEvents.length + 1);
    expect(outcome.positions.map((p) => p.event).slice(1)).toEqual(
      persistedEvents,
    );
    expect(outcome.positions.map((p) => p.position)).toEqual(
      outcome.positions.map((_, index) => index),
    );

    // Each position's state is the fold of every event up to and including it.
    let expected: EngineState = { seats: [0, 1, 2], button: 0, hand: null };
    for (const [index, event] of persistedEvents.entries()) {
      expected = apply(expected, event);
      expect(outcome.positions[index + 1]?.state).toEqual(expected);
    }
  });

  it("reaches state the terminal view cannot express — a folded-out hand's board", () => {
    // Seat 1 folds on the turn, leaving a board no `FoldedOutView` carries.
    const start: EngineState = { seats: [0, 1], button: 0, hand: null };
    const { recording } = record(start, [
      { type: "startHand", seatId: 0, seed: "board-seed" },
      { type: "call", seatId: 0 },
      { type: "check", seatId: 1 },
      { type: "check", seatId: 1 },
      { type: "check", seatId: 0 },
      { type: "fold", seatId: 1 },
    ]);
    const outcome = replayHand(inputFrom(recording));

    expect(outcome.status).toBe("complete");
    if (outcome.status !== "complete") return;
    const boardDealt = outcome.positions.find(
      (position) => position.event?.type === "BoardDealt",
    );
    const board =
      boardDealt?.state.hand?.status === "betting"
        ? boardDealt.state.hand.board
        : [];
    expect(board).toHaveLength(3);
  });

  it("replays a burn with the street it opens already visible in state", () => {
    const start: EngineState = { seats: [0, 1, 2], button: 0, hand: null };
    const { recording } = record(start, [
      { type: "startHand", seatId: 0, seed: "burn-replay-seed" },
      { type: "call", seatId: 0 },
      { type: "call", seatId: 1 },
      { type: "check", seatId: 2 },
    ]);
    const outcome = replayHand(inputFrom(recording));

    expect(outcome.status).toBe("complete");
    if (outcome.status !== "complete") return;
    const burn = outcome.positions.find(
      (position) => position.event?.type === "CardBurned",
    );
    if (burn?.event?.type !== "CardBurned") {
      throw new Error("expected a flop burn");
    }
    if (burn.state.hand?.status !== "betting") {
      throw new Error("expected a betting hand after a burn");
    }
    expect(burn.state.hand.street).toBe(burn.event.street);
    expect(burn.state.hand.board).toHaveLength(0);
  });

  it("is pure — the same input replays to the same flipbook", () => {
    const recording = foldOutHand();
    expect(replayHand(inputFrom(recording))).toEqual(
      replayHand(inputFrom(recording)),
    );
  });
});

describe("replayHand: rejections", () => {
  it("validates them without advancing the event ordinal or changing state", () => {
    const start: EngineState = { seats: [0, 1, 2], button: 0, hand: null };
    const { recording } = record(start, [
      { type: "startHand", seatId: 0, seed: "replay-seed" },
      // Seat 2 is not the actor preflop (ring is [0, 1, 2]) — rejected.
      { type: "fold", seatId: 2 },
      { type: "fold", seatId: 0 },
      { type: "fold", seatId: 1 },
    ]);
    const rejected = recording.events.filter((e) => e.type === "Rejection");
    expect(rejected).toHaveLength(1);

    const outcome = replayHand(inputFrom(recording));
    expect(outcome.status).toBe("complete");
    if (outcome.status !== "complete") return;

    expect(outcome.rejections).toEqual([
      {
        position: 3,
        record: 3,
        rejection: {
          type: "Rejection",
          reason: "not-your-turn",
          command: { type: "fold", seatId: 2 },
        } satisfies Rejection,
      },
    ]);
    // Position 3 is the last event before the rejection, and the events after
    // it carry on from that unchanged state.
    expect(outcome.positions[3]?.event?.type).toBe("StreetStarted");
    expect(outcome.positions[4]?.event).toEqual({
      type: "ActionTaken",
      seatId: 0,
      action: "fold",
    });
  });
});

describe("replayHand: the starting state", () => {
  it("replays a later hand from its recorded button and leading nextHand", () => {
    // Hand 1 played out live; hand 2 opens on the rotated button and its
    // command log begins with the `nextHand` that started it.
    const first = record({ seats: [0, 1, 2], button: 0, hand: null }, [
      { type: "startHand", seatId: 0, seed: "hand-1" },
      { type: "fold", seatId: 0 },
      { type: "fold", seatId: 1 },
    ]);
    expect(first.state.button).toBe(1);

    const second = record(first.state, [
      { type: "nextHand", seatId: 0, seed: "hand-2" },
      { type: "fold", seatId: 1 },
      { type: "fold", seatId: 2 },
    ]);
    expect(second.recording.context.button).toBe(1);

    const outcome = replayHand(inputFrom(second.recording));
    expect(outcome.status).toBe("complete");
    if (outcome.status !== "complete") return;
    expect(outcome.positions[0]?.state).toEqual({
      seats: [0, 1, 2],
      button: 1,
      hand: null,
    });
    expect(outcome.positions.at(-1)?.state).toEqual(second.state);
  });
});

describe("replayHand: context validation", () => {
  it("fails at the boundary when the button is not a seated player", () => {
    const recording = foldOutHand();
    const outcome = replayHand(
      inputFrom(recording, {
        context: { ...recording.context, button: 7 },
      }),
    );

    expect(outcome).toEqual({
      status: "failed",
      failure: {
        kind: "invalid-context",
        reason: "button-not-seated",
        file: sources.context,
      },
    });
  });

  it.each([
    { label: "too few seats", seats: [0] },
    { label: "too many seats", seats: [0, 1, 2, 3, 4, 5, 6, 7, 8] },
  ])("fails when a context has $label", ({ seats }) => {
    const recording = foldOutHand();
    const outcome = replayHand(
      inputFrom(recording, {
        context: { ...recording.context, seats, button: 0 },
      }),
    );

    expect(outcome).toEqual({
      status: "failed",
      failure: {
        kind: "invalid-context",
        reason: "seat-count-out-of-range",
        file: sources.context,
      },
    });
  });

  it("fails when the command log does not open by starting a hand", () => {
    const recording = foldOutHand();
    const outcome = replayHand(
      inputFrom(recording, { commands: recording.commands.slice(1) }),
    );

    expect(outcome).toEqual({
      status: "failed",
      failure: {
        kind: "invalid-command-log",
        reason: "does-not-start-a-hand",
        file: sources.commands,
      },
    });
  });

  it("fails when the command log is empty", () => {
    const outcome = replayHand(inputFrom(foldOutHand(), { commands: [] }));

    expect(outcome).toEqual({
      status: "failed",
      failure: {
        kind: "invalid-command-log",
        reason: "empty",
        file: sources.commands,
      },
    });
  });
});

describe("replayHand: version tags", () => {
  it("rejects a context that does not carry the running engine log version", () => {
    const recording = foldOutHand();
    const outcome = replayHand(
      inputFrom(recording, { context: { ...recording.context, v: 1 } }),
    );

    expect(outcome).toEqual({
      status: "failed",
      failure: {
        kind: "unsupported-version",
        expected: ENGINE_LOG_VERSION,
        actual: 1,
        file: sources.context,
        record: null,
      },
    });
  });

  it("rejects a stale command record, naming its file and ordinal", () => {
    const recording = foldOutHand();
    const commands = [...recording.commands];
    commands[2] = { ...must(commands[2]), v: 2 };
    const outcome = replayHand(inputFrom(recording, { commands }));

    expect(outcome).toEqual({
      status: "failed",
      failure: {
        kind: "unsupported-version",
        expected: ENGINE_LOG_VERSION,
        actual: 2,
        file: sources.commands,
        record: 2,
      },
    });
  });

  it("rejects a stale event record, naming its file and ordinal", () => {
    const recording = foldOutHand();
    const events = [...recording.events];
    events[1] = { ...must(events[1]), v: 99 };
    const outcome = replayHand(inputFrom(recording, { events }));

    expect(outcome).toEqual({
      status: "failed",
      failure: {
        kind: "unsupported-version",
        expected: ENGINE_LOG_VERSION,
        actual: 99,
        file: sources.events,
        record: 1,
      },
    });
  });

  it("reports the version mismatch ahead of an invalid context", () => {
    const recording = foldOutHand();
    const outcome = replayHand(
      inputFrom(recording, {
        context: { ...recording.context, v: 1, button: 7 },
      }),
    );

    expect(outcome.status === "failed" ? outcome.failure.kind : null).toBe(
      "unsupported-version",
    );
  });
});

describe("replayHand: generated against persisted", () => {
  it("hard-fails on the first differing record", () => {
    const recording = foldOutHand();
    const events = [...recording.events];
    events[2] = {
      type: "StreetStarted",
      street: "preflop",
      actor: 99,
      v: ENGINE_LOG_VERSION,
    };
    const outcome = replayHand(inputFrom(recording, { events }));

    expect(outcome.status).toBe("failed");
    if (outcome.status !== "failed") return;
    expect(outcome.failure.kind).toBe("record-mismatch");
    if (outcome.failure.kind !== "record-mismatch") return;
    expect(outcome.failure.record).toBe(2);
    expect(outcome.failure.file).toBe(sources.events);
    expect(outcome.failure.generated).toEqual({
      type: "StreetStarted",
      street: "preflop",
      actor: 0,
    });
    expect(outcome.failure.persisted).toEqual({
      type: "StreetStarted",
      street: "preflop",
      actor: 99,
    });
  });

  it("hard-fails when the persisted stream runs past the generated one", () => {
    const recording = foldOutHand();
    const extra = must(recording.events[0]);
    const outcome = replayHand(
      inputFrom(recording, { events: [...recording.events, extra] }),
    );

    expect(outcome.status).toBe("failed");
    if (outcome.status !== "failed") return;
    expect(outcome.failure.kind).toBe("record-mismatch");
    if (outcome.failure.kind !== "record-mismatch") return;
    expect(outcome.failure.record).toBe(recording.events.length);
    expect(outcome.failure.generated).toBeNull();
    expect(outcome.failure.persisted).toEqual({
      type: "HandStarted",
      seed: "replay-seed",
      button: 0,
    });
  });
});

describe("replayHand: incomplete, not corrupt", () => {
  it("stops at the last corroborated operation for an orphaned trailing command", () => {
    const recording = foldOutHand();
    // The audit stream stops after the first fold's `ActionTaken`; the third
    // command has no recorded outcome at all.
    const events = recording.events.slice(0, 4);
    const outcome = replayHand(inputFrom(recording, { events }));

    expect(outcome.status).toBe("incomplete");
    if (outcome.status !== "incomplete") return;
    expect(outcome.orphanedCommand).toBe(2);
    expect(outcome.tornRecord).toBeNull();
    // Positions cover the whole corroborated prefix and nothing beyond it.
    expect(outcome.positions).toHaveLength(events.length + 1);
    expect(outcome.positions.at(-1)?.event).toEqual({
      type: "ActionTaken",
      seatId: 0,
      action: "fold",
    });
  });

  it("discards a partially recorded operation rather than half-applying it", () => {
    const recording = foldOutHand();
    // Cut mid-operation: the last fold generated three events, only one of
    // which was recorded before the process died.
    const events = recording.events.slice(0, recording.events.length - 2);
    const outcome = replayHand(inputFrom(recording, { events }));

    expect(outcome.status).toBe("incomplete");
    if (outcome.status !== "incomplete") return;
    expect(outcome.orphanedCommand).toBe(2);
    // The half-recorded operation contributes no position at all.
    expect(outcome.positions).toHaveLength(5);
    expect(outcome.positions.at(-1)?.event).toEqual({
      type: "ActionTaken",
      seatId: 0,
      action: "fold",
    });
  });

  it("is corrupt, not incomplete, when a surviving tail record disagrees", () => {
    const recording = foldOutHand();
    // The last operation generated three events and only one was recorded —
    // and that one contradicts the Command log. Less evidence than there are
    // Commands is incomplete only while nothing disagrees.
    const events = recording.events.slice(0, 5);
    events[4] = {
      type: "ActionTaken",
      seatId: 2,
      action: "fold",
      v: ENGINE_LOG_VERSION,
    };
    const outcome = replayHand(inputFrom(recording, { events }));

    expect(outcome.status).toBe("failed");
    if (outcome.status !== "failed") return;
    expect(outcome.failure.kind).toBe("record-mismatch");
    if (outcome.failure.kind !== "record-mismatch") return;
    expect(outcome.failure.record).toBe(4);
    expect(outcome.failure.generated).toEqual({
      type: "ActionTaken",
      seatId: 1,
      action: "fold",
    });
  });

  it("reports a torn final record with its file and line", () => {
    const recording = foldOutHand();
    const tornRecord = { file: sources.events, line: 9 };
    const outcome = replayHand(inputFrom(recording, { tornRecord }));

    expect(outcome.status).toBe("incomplete");
    if (outcome.status !== "incomplete") return;
    expect(outcome.tornRecord).toEqual(tornRecord);
    expect(outcome.orphanedCommand).toBeNull();
    // The intact prefix the adapter did hand over still replays in full.
    expect(outcome.positions).toHaveLength(recording.events.length + 1);
  });

  it("reports both when a torn tail also orphaned the trailing command", () => {
    const recording = foldOutHand();
    const tornRecord = { file: sources.events, line: 6 };
    const outcome = replayHand(
      inputFrom(recording, {
        events: recording.events.slice(0, 4),
        tornRecord,
      }),
    );

    expect(outcome.status).toBe("incomplete");
    if (outcome.status !== "incomplete") return;
    expect(outcome.tornRecord).toEqual(tornRecord);
    expect(outcome.orphanedCommand).toBe(2);
  });
});
