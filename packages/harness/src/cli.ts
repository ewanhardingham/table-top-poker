#!/usr/bin/env node
import { createInitialState } from "@table-top-poker/engine";
import { parseLogOptions, parseSeats } from "./cli-args.js";
import { runHarness } from "./harness.js";
import { HandLog } from "./persistence.js";

process.stdout.on("error", (error: NodeJS.ErrnoException) => {
  if (error.code === "EPIPE") process.exit(0);
  throw error;
});

try {
  const argv = process.argv.slice(2);
  const seats = parseSeats(argv);
  const logOptions = parseLogOptions(argv);

  await runHarness({
    state: createInitialState(seats),
    input: process.stdin,
    output: process.stdout,
    ...(logOptions
      ? { log: new HandLog(logOptions.logDir, logOptions.gameId, seats) }
      : {}),
  });
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
