#!/usr/bin/env node
import { createInitialState } from "@table-top-poker/engine";
import type { SeatId } from "@table-top-poker/engine";
import { runHarness } from "./harness.js";

function parseSeats(argv: readonly string[]): SeatId[] {
  const flagIndex = argv.indexOf("--seats");
  if (flagIndex === -1) return [0, 1, 2];

  const value = argv[flagIndex + 1];
  if (value === undefined) {
    throw new Error("--seats requires a comma-separated list of seat ids");
  }
  return value.split(",").map((seat) => {
    const trimmed = seat.trim();
    if (!/^\d+$/.test(trimmed)) {
      throw new Error(`--seats: "${seat}" is not a non-negative integer`);
    }
    return Number.parseInt(trimmed, 10);
  });
}

try {
  await runHarness({
    state: createInitialState(parseSeats(process.argv.slice(2))),
    input: process.stdin,
    output: process.stdout,
  });
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
