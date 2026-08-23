import {
  apply,
  decide,
  ENGINE_LOG_VERSION,
  legalActions,
} from "@table-top-poker/protocol";
import type {
  ActionType,
  Command,
  EngineState,
  HandEvent,
  Street,
} from "@table-top-poker/protocol";
import {
  handRecordingPaths,
  readHandRecording,
  type HandRecordingRead,
} from "@table-top-poker/recording";
import { createMemoryFileSystem } from "@table-top-poker/recording/testing";
import { describe, expect, it } from "vitest";
import { tableReplayOf } from "./hand-replay.js";

const roomDir = "/recordings/room-1";
const paths = handRecordingPaths(roomDir, 1);
const seats = [0, 1, 2];
const button = 0;

/**
 * Runs Commands through the engine exactly as a live Room would, keeping the
 * generated records. Fixtures are *recorded*, never hand-authored: the
 * adapter's whole job is to agree with the engine, so a fixture that
 * disagreed with it would prove nothing.
 */
function play(commands: readonly Command[]): {
  readonly state: EngineState;
  readonly records: readonly (HandEvent | { type: "Rejection" })[];
} {
  let state: EngineState = { seats: [...seats], button, hand: null };
  const records: (HandEvent | { type: "Rejection" })[] = [];
  for (const command of commands) {
    const outcome = decide(state, command);
    for (const record of Array.isArray(outcome) ? outcome : [outcome]) {
      records.push(record);
      if (record.type !== "Rejection") state = apply(state, record);
    }
  }
  return { state, records };
}

async function record(
  commands: readonly Command[],
): Promise<HandRecordingRead> {
  const { records } = play(commands);
  const fileSystem = createMemoryFileSystem();
  await fileSystem.mkdir(roomDir);
  await fileSystem.writeFile(
    paths.contextPath,
    JSON.stringify({
      v: ENGINE_LOG_VERSION,
      roomId: "room-1",
      handOrdinal: 1,
      startedAt: "2026-08-20T12:00:00.000Z",
      seats,
      button,
    }) + "\n",
  );
  const lines = (items: readonly object[]) =>
    items
      .map((item) => JSON.stringify({ ...item, v: ENGINE_LOG_VERSION }) + "\n")
      .join("");
  await fileSystem.writeFile(paths.commandsPath, lines(commands));
  await fileSystem.writeFile(paths.eventsPath, lines(records));
  return readHandRecording({ fileSystem, roomDir, handOrdinal: 1 });
}

/**
 * Drives a whole hand from a seat-blind policy, so a fixture is always a
 * sequence the engine actually accepted — action order is button-relative and
 * hand-authoring it invites a fixture full of `not-your-turn`.
 */
function drive(
  seed: string,
  choose: (street: Street, legal: readonly ActionType[]) => ActionType,
): readonly Command[] {
  const commands: Command[] = [{ type: "startHand", seatId: 0, seed }];
  for (let guard = 0; guard < 60; guard += 1) {
    const hand = play(commands).state.hand;
    if (hand?.status !== "betting") break;
    const actor = hand.toAct[0];
    if (actor === undefined) break;
    commands.push({
      type: choose(hand.street, legalActions(hand, actor)),
      seatId: actor,
    });
  }
  return commands;
}

const passively = (legal: readonly ActionType[]): ActionType =>
  legal.includes("check") ? "check" : "call";

const foldOut = drive("seed-1", () => "fold");
const checkedDown = drive("seed-2", (_street, legal) => passively(legal));
const foldOutOnTheTurn = drive("seed-3", (street, legal) =>
  street === "turn" ? "fold" : passively(legal),
);

function eventTypesOf(
  positions: readonly { readonly event: HandEvent | null }[],
): (string | null)[] {
  return positions.map((position) => position.event?.type ?? null);
}

describe("tableReplayOf", () => {
  it("projects every position through the table view boundary", async () => {
    const replay = tableReplayOf(await record(foldOut));

    if (replay.status !== "replayed") throw new Error(replay.diagnostic);
    expect(replay.positions[0]).toEqual({
      event: null,
      view: { phase: "no-hand", button },
    });
    expect(eventTypesOf(replay.positions)).toEqual([
      null,
      "HandStarted",
      "HoleCardsDealt",
      "StreetStarted",
      "ActionTaken",
      "ActionTaken",
      "HandFoldedOut",
      "HandComplete",
    ]);
  });

  it("carries no EngineState and no seat's hole cards in any view", async () => {
    const replay = tableReplayOf(await record(foldOut));

    if (replay.status !== "replayed") throw new Error(replay.diagnostic);
    const views = JSON.stringify(replay.positions.map((p) => p.view));
    expect(views).not.toContain("holeCards");
    expect(views).not.toContain("players");
    expect(views).not.toContain("ring");
    expect(views).not.toContain("seed");
  });

  it("hands the table an empty deal, never a seat's two cards", async () => {
    const replay = tableReplayOf(await record(foldOut));

    if (replay.status !== "replayed") throw new Error(replay.diagnostic);
    const dealt = replay.positions.find(
      (position) => position.event?.type === "HoleCardsDealt",
    );
    expect(dealt?.event).toEqual({ type: "HoleCardsDealt", deals: [] });
    expect(JSON.stringify(replay.positions)).not.toContain("rank");
  });

  it("never lets a burnt card's identity reach the table", async () => {
    const replay = tableReplayOf(await record(foldOutOnTheTurn));

    if (replay.status !== "replayed") throw new Error(replay.diagnostic);
    const burns = replay.positions.flatMap((position) =>
      position.event?.type === "CardBurned" ? [position.event] : [],
    );
    expect(burns.length).toBeGreaterThan(0);
    for (const burn of burns) expect(burn.card).toBeNull();
  });

  it("replays a hand that reached showdown", async () => {
    const replay = tableReplayOf(await record(checkedDown));

    if (replay.status !== "replayed") throw new Error(replay.diagnostic);
    expect(replay.positions.at(-1)?.event).toEqual({ type: "HandComplete" });
    expect(replay.positions.some((p) => p.view.phase === "showdown")).toBe(
      true,
    );
  });

  it("keeps a fold-out hand's board, which its terminal view cannot express", async () => {
    const replay = tableReplayOf(await record(foldOutOnTheTurn));

    if (replay.status !== "replayed") throw new Error(replay.diagnostic);
    expect(replay.positions.at(-1)?.view.phase).toBe("folded-out");
    // The final view has no board at all, so the four cards the table
    // watched land are only reachable from the positions before it.
    const boards = replay.positions.flatMap((p) =>
      "board" in p.view ? [p.view.board.length] : [],
    );
    expect(Math.max(...boards)).toBe(4);
  });

  it("refuses a hand whose recording could not be read", () => {
    const replay = tableReplayOf({
      status: "missing-file",
      file: paths.contextPath,
    });

    expect(replay.status).toBe("unavailable");
  });

  it("refuses an incomplete hand rather than serving its prefix", async () => {
    const read = await record(foldOut);
    if (read.status !== "read") throw new Error("expected a read");

    const replay = tableReplayOf({
      status: "read",
      input: { ...read.input, events: read.input.events.slice(0, -1) },
    });

    expect(replay.status).toBe("unavailable");
  });

  it("refuses a hand whose persisted events disagree with the replay", async () => {
    const read = await record(foldOut);
    if (read.status !== "read") throw new Error("expected a read");
    const events = [...read.input.events];
    events[1] = { type: "HandComplete", v: ENGINE_LOG_VERSION };

    const replay = tableReplayOf({
      status: "read",
      input: { ...read.input, events },
    });

    expect(replay.status).toBe("unavailable");
  });
});
