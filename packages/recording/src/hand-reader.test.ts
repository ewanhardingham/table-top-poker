import { ENGINE_LOG_VERSION } from "@table-top-poker/engine";
import { describe, expect, it } from "vitest";
import { readHandRecording } from "./hand-reader.js";
import { createMemoryFileSystem } from "./memory-file-system.js";
import { handRecordingPaths } from "./paths.js";

const roomDir = "/recordings/room-1";
const paths = handRecordingPaths(roomDir, 1);

const context = {
  v: ENGINE_LOG_VERSION,
  roomId: "room-1",
  handOrdinal: 1,
  startedAt: "2026-08-20T12:00:00.000Z",
  seats: [0, 1, 2],
  button: 1,
};

function jsonl(records: readonly unknown[]): string {
  return records.map((record) => JSON.stringify(record) + "\n").join("");
}

const commands = [
  { type: "startHand", seatId: 0, seed: "s", v: ENGINE_LOG_VERSION },
  { type: "fold", seatId: 2, v: ENGINE_LOG_VERSION },
];

const events = [
  { type: "HandStarted", seed: "s", button: 1, v: ENGINE_LOG_VERSION },
  { type: "ActionTaken", seatId: 2, action: "fold", v: ENGINE_LOG_VERSION },
];

async function diskWith(
  files: Readonly<Record<string, string>>,
): Promise<ReturnType<typeof createMemoryFileSystem>> {
  const fileSystem = createMemoryFileSystem();
  await fileSystem.mkdir(roomDir);
  for (const [filePath, contents] of Object.entries(files)) {
    await fileSystem.writeFile(filePath, contents);
  }
  return fileSystem;
}

const wholeHand = {
  [paths.contextPath]: JSON.stringify(context) + "\n",
  [paths.commandsPath]: jsonl(commands),
  [paths.eventsPath]: jsonl(events),
};

describe("readHandRecording", () => {
  it("assembles the replay input a Hand's three files hold", async () => {
    const fileSystem = await diskWith(wholeHand);

    const read = await readHandRecording({
      fileSystem,
      roomDir,
      handOrdinal: 1,
    });

    expect(read).toEqual({
      status: "read",
      input: {
        sources: {
          context: paths.contextPath,
          commands: paths.commandsPath,
          events: paths.eventsPath,
        },
        context: { v: ENGINE_LOG_VERSION, seats: [0, 1, 2], button: 1 },
        commands,
        events,
        tornRecord: null,
      },
    });
  });

  it("reports a missing context file rather than replaying without one", async () => {
    const fileSystem = await diskWith({
      [paths.commandsPath]: jsonl(commands),
      [paths.eventsPath]: jsonl(events),
    });

    expect(
      await readHandRecording({ fileSystem, roomDir, handOrdinal: 1 }),
    ).toEqual({ status: "missing-file", file: paths.contextPath });
  });

  it("reads a missing commands or events file as empty", async () => {
    const fileSystem = await diskWith({
      [paths.contextPath]: JSON.stringify(context) + "\n",
    });

    const read = await readHandRecording({
      fileSystem,
      roomDir,
      handOrdinal: 1,
    });

    expect(read).toMatchObject({
      status: "read",
      input: { commands: [], events: [] },
    });
  });

  it("tolerates an unterminated final line as torn, not malformed", async () => {
    const fileSystem = await diskWith({
      ...wholeHand,
      [paths.eventsPath]: jsonl([events[0]]) + '{"type":"ActionTa',
    });

    const read = await readHandRecording({
      fileSystem,
      roomDir,
      handOrdinal: 1,
    });

    expect(read).toMatchObject({
      status: "read",
      input: {
        events: [events[0]],
        tornRecord: { file: paths.eventsPath, line: 2 },
      },
    });
  });

  it("reports a malformed line that is not the last one", async () => {
    const fileSystem = await diskWith({
      ...wholeHand,
      [paths.eventsPath]: "{oh no\n" + jsonl(events),
    });

    expect(
      await readHandRecording({ fileSystem, roomDir, handOrdinal: 1 }),
    ).toEqual({
      status: "malformed-record",
      file: paths.eventsPath,
      line: 1,
    });
  });

  it("reports a context document that does not parse", async () => {
    const fileSystem = await diskWith({
      ...wholeHand,
      [paths.contextPath]: "{not json",
    });

    expect(
      await readHandRecording({ fileSystem, roomDir, handOrdinal: 1 }),
    ).toEqual({
      status: "malformed-record",
      file: paths.contextPath,
      line: 1,
    });
  });

  it("reads the hand the ordinal names, not whichever one is there", async () => {
    const second = handRecordingPaths(roomDir, 2);
    const fileSystem = await diskWith({
      ...wholeHand,
      [second.contextPath]:
        JSON.stringify({ ...context, handOrdinal: 2, button: 2 }) + "\n",
      [second.commandsPath]: jsonl(commands),
      [second.eventsPath]: jsonl(events),
    });

    const read = await readHandRecording({
      fileSystem,
      roomDir,
      handOrdinal: 2,
    });

    expect(read).toMatchObject({
      status: "read",
      input: {
        context: { button: 2 },
        sources: { context: second.contextPath },
      },
    });
  });
});
