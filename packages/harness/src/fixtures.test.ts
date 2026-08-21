import { createReadStream } from "node:fs";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { Writable } from "node:stream";
import { describe, expect, it } from "vitest";
import {
  apply,
  createInitialState,
  ENGINE_LOG_VERSION,
} from "@table-top-poker/engine";
import type { HandEvent } from "@table-top-poker/engine";
import { runHarness } from "./harness.js";

const fixturesDir = fileURLToPath(new URL("../fixtures/", import.meta.url));

function collectingWritable(): { writable: Writable; text: () => string } {
  const chunks: string[] = [];
  const writable = new Writable({
    write(chunk: Buffer, _encoding, callback) {
      chunks.push(chunk.toString("utf8"));
      callback();
    },
  });
  return { writable, text: () => chunks.join("") };
}

describe("hand-1 fixture", () => {
  it("produces the previously captured event stream, byte-for-byte", async () => {
    const expected = await readFile(`${fixturesDir}hand-1.expected.jsonl`, {
      encoding: "utf8",
    });
    const { writable, text } = collectingWritable();

    await runHarness({
      state: createInitialState([0, 1, 2]),
      input: createReadStream(`${fixturesDir}hand-1.commands.jsonl`),
      output: writable,
    });

    expect(text()).toBe(expected);
  });
});

describe("hand-1 fixture: replay through the engine", () => {
  it("folds the recorded event log into a state carrying the hand's blinds", async () => {
    const recorded = await readFile(`${fixturesDir}hand-1.expected.jsonl`, {
      encoding: "utf8",
    });
    const events = recorded
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line) as HandEvent);

    let state = createInitialState([0, 1, 2]);
    for (const event of events) state = apply(state, event);

    expect(ENGINE_LOG_VERSION).toBe(5);
    if (state.hand?.status !== "complete") throw new Error("expected complete");
    expect(state.hand.button).toBe(0);
    expect(state.hand.smallBlind).toBe(1);
    expect(state.hand.bigBlind).toBe(2);
    expect(state.hand.dealtSeatCount).toBe(3);
  });
});
