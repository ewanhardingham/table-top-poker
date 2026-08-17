#!/usr/bin/env node
import { createInitialState } from "@table-top-poker/engine";
import { DirectoryRecordings } from "@table-top-poker/recording";
import type { RoomRecording } from "@table-top-poker/recording";
import { parseRecordingOptions, parseSeats } from "./cli-args.js";
import { runHarness } from "./harness.js";
import { runReplayCli } from "./replay-cli.js";

for (const stream of [process.stdout, process.stderr]) {
  stream.on("error", (error: NodeJS.ErrnoException) => {
    if (error.code === "EPIPE") process.exit(0);
    throw error;
  });
}

const argv = process.argv.slice(2);

if (argv[0] === "replay") {
  process.exitCode = await runReplayCli(argv.slice(1), {
    stdout: process.stdout,
    stderr: process.stderr,
  });
} else {
  try {
    const seats = parseSeats(argv);
    const recordingOptions = parseRecordingOptions(argv);

    let recording: RoomRecording | undefined;
    if (recordingOptions !== null) {
      const recordings = new DirectoryRecordings(
        recordingOptions.recordingsDir,
      );
      recording = await recordings.create({
        roomId: recordingOptions.roomId,
        // A harness run was never joinable through a code.
        code: null,
        createdAt: new Date().toISOString(),
      });
    }

    await runHarness({
      state: createInitialState(seats),
      input: process.stdin,
      output: process.stdout,
      ...(recording === undefined ? {} : { recording }),
    });
    await recording?.close();
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
