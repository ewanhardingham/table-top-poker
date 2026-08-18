import { ENGINE_LOG_VERSION } from "@table-top-poker/engine";
import type { RecordingFileSystem } from "./file-system.js";
import { handRecordingPaths } from "./paths.js";
import type { HandRecordingPaths } from "./paths.js";
import type {
  HandContext,
  RecordedCommand,
  RecordedEvent,
  RoomOperation,
} from "./records.js";

export interface RoomRecordingOptions {
  readonly roomId: string;
  readonly roomDir: string;
  readonly fileSystem: RecordingFileSystem;
  /** Extra attempts after the first before an operation is declared failed. */
  readonly retries?: number;
}

/** Byte offsets past which a Hand's files are not yet confirmed on disk. */
interface ConfirmedOffsets {
  readonly commands: number;
  readonly events: number;
}

const NO_OFFSETS: ConfirmedOffsets = { commands: 0, events: 0 };

function jsonLine(record: unknown): string {
  return JSON.stringify(record) + "\n";
}

function byteLength(text: string): number {
  return Buffer.byteLength(text, "utf8");
}

/**
 * One Room's durable recording: the append-as-you-go writer behind
 * `<RECORDINGS_DIR>/<room-id>/`. Created by {@link DirectoryRecordings},
 * which has already written the `room.json` this recording lives alongside.
 *
 * Callers hand it whole engine operations and nothing else. It owns version
 * tagging, serialization, which Hand's files a record belongs in, ordering
 * across concurrent callers, the confirmed byte offsets a partial write is
 * rolled back to, retry, and a clean close.
 *
 * An operation that still fails after its retries **latches** the recording:
 * every later operation is refused rather than written past the gap, because
 * a Command stream with a hole in it is worse than no Command stream. `retry`
 * and `discardLatched` are the table-facing recovery from that state — see
 * recording-paused in `docs/design/server.md`.
 */
export class RoomRecording {
  readonly roomId: string;
  readonly roomDir: string;
  readonly #fs: RecordingFileSystem;
  readonly #retries: number;
  /** Serializes appends: every operation chains onto the previous one's tail. */
  #queue: Promise<void> = Promise.resolve();
  #closing = false;
  #failed = false;
  #handOrdinal = 0;
  #paths: HandRecordingPaths | null = null;
  #confirmed: ConfirmedOffsets = NO_OFFSETS;

  constructor(options: RoomRecordingOptions) {
    this.roomId = options.roomId;
    this.roomDir = options.roomDir;
    this.#fs = options.fileSystem;
    this.#retries = options.retries ?? 2;
  }

  /**
   * Appends one complete engine operation. Resolves once every line of it is
   * confirmed on disk; rejects — leaving the files exactly as they were —
   * once the retries are spent.
   */
  append(operation: RoomOperation): Promise<void> {
    if (this.#closing) {
      return Promise.reject(
        new Error(`recording for room ${this.roomId} is closed`),
      );
    }
    const settled = this.#queue.then(() => this.#appendNow(operation));
    // The queue tracks *completion*, not success: a rejected operation still
    // has to release the next caller, which `#appendNow` then refuses on its
    // own terms. Without this the rejection would also be unhandled here.
    this.#queue = settled.then(
      () => undefined,
      () => undefined,
    );
    return settled;
  }

  /**
   * Stops accepting operations and waits for those already queued to finish.
   * Called when a Room ends and on `SIGINT`/`SIGTERM`.
   */
  async close(): Promise<void> {
    this.#closing = true;
    await this.#queue;
  }

  /**
   * Retries the operation a caller retained after this recording latched.
   * Truncates its Hand's files back to the last confirmed offsets first — the
   * failed attempt's own rollback may itself have failed on the same broken
   * disk, and this defends against that torn tail surviving into the retry —
   * then writes the operation fresh. Resolves once it is confirmed; rejects,
   * leaving the recording latched, if the retry fails too.
   */
  retry(operation: RoomOperation): Promise<void> {
    const settled = this.#queue.then(() => this.#retryNow(operation));
    this.#queue = settled.then(
      () => undefined,
      () => undefined,
    );
    return settled;
  }

  async #retryNow(operation: RoomOperation): Promise<void> {
    if (!this.#failed) {
      throw new Error(`recording for room ${this.roomId} is not paused`);
    }
    await this.#rollbackLatched(operation);
    this.#failed = false;
    return this.#appendNow(operation);
  }

  /**
   * Discards the operation a caller retained after this recording latched,
   * restoring its Hand's files to their last confirmed offsets on a
   * best-effort basis — the exit a paused Room takes when the table chooses
   * to end rather than retry. A no-op when the recording never latched.
   */
  async discardLatched(operation: RoomOperation | undefined): Promise<void> {
    const settled = this.#queue.then(() => this.#discardLatchedNow(operation));
    this.#queue = settled.then(
      () => undefined,
      () => undefined,
    );
    return settled;
  }

  async #discardLatchedNow(
    operation: RoomOperation | undefined,
  ): Promise<void> {
    if (!this.#failed || operation === undefined) return;
    await this.#rollbackLatched(operation);
  }

  /**
   * The latched operation's own paths, from the state `#appendNow` restored
   * after the failure — a hand-opening operation's paths are one Hand ahead
   * of `#paths`, which still names the previous, already-confirmed Hand.
   */
  async #rollbackLatched(operation: RoomOperation): Promise<void> {
    const opensHand = operation.context !== undefined;
    const paths = opensHand
      ? handRecordingPaths(this.roomDir, this.#handOrdinal + 1)
      : this.#paths;
    if (paths !== null) {
      await this.#rollback(paths, this.#confirmed, opensHand);
    }
  }

  async #appendNow(operation: RoomOperation): Promise<void> {
    if (this.#failed) {
      throw new Error(`recording-paused: room ${this.roomId}`);
    }

    const opensHand = operation.context !== undefined;
    const previous = {
      handOrdinal: this.#handOrdinal,
      paths: this.#paths,
      confirmed: this.#confirmed,
    };
    if (operation.context !== undefined) {
      this.#handOrdinal += 1;
      this.#paths = handRecordingPaths(this.roomDir, this.#handOrdinal);
      this.#confirmed = NO_OFFSETS;
    }

    const paths = this.#paths;
    // A Command outside any Hand belongs to no Hand recording — the engine
    // transcript begins at an accepted `startHand`/`nextHand` (spec #129 §3).
    if (paths === null) return;

    const context: HandContext | undefined =
      operation.context === undefined
        ? undefined
        : {
            v: ENGINE_LOG_VERSION,
            roomId: this.roomId,
            handOrdinal: this.#handOrdinal,
            startedAt: operation.context.startedAt,
            seats: [...operation.context.seats],
            button: operation.context.button,
          };
    const commandLine = jsonLine({
      ...operation.command,
      v: ENGINE_LOG_VERSION,
    } satisfies RecordedCommand);
    const outcome = Array.isArray(operation.outcome)
      ? operation.outcome
      : [operation.outcome];
    const eventLines = outcome
      .map((record) =>
        jsonLine({ ...record, v: ENGINE_LOG_VERSION } satisfies RecordedEvent),
      )
      .join("");

    const confirmed = this.#confirmed;
    for (let attempt = 0; ; attempt += 1) {
      try {
        if (context !== undefined) {
          await this.#fs.writeFile(paths.contextPath, jsonLine(context));
        }
        await this.#fs.appendFile(paths.commandsPath, commandLine);
        if (eventLines !== "") {
          await this.#fs.appendFile(paths.eventsPath, eventLines);
        }
        this.#confirmed = {
          commands: confirmed.commands + byteLength(commandLine),
          events: confirmed.events + byteLength(eventLines),
        };
        return;
      } catch (cause) {
        await this.#rollback(paths, confirmed, opensHand);
        if (attempt >= this.#retries) {
          this.#failed = true;
          this.#handOrdinal = previous.handOrdinal;
          this.#paths = previous.paths;
          this.#confirmed = previous.confirmed;
          throw new Error(`recording append failed for room ${this.roomId}`, {
            cause,
          });
        }
      }
    }
  }

  /**
   * Cuts a half-written operation back to the last offsets this recording
   * confirmed, so the files stay a prefix of completed operations.
   *
   * Every repair here is itself a write, and the filesystem that just refused
   * one may refuse these too — a worn card flips read-only and stays there.
   * Failures are therefore swallowed: the operation is being reported as
   * failed regardless, and §4's incomplete-Hand rule is what reads whatever
   * is left behind.
   */
  async #rollback(
    paths: HandRecordingPaths,
    confirmed: ConfirmedOffsets,
    opensHand: boolean,
  ): Promise<void> {
    if (opensHand) {
      for (const filePath of [
        paths.contextPath,
        paths.commandsPath,
        paths.eventsPath,
      ]) {
        await this.#tolerate(() => this.#fs.remove(filePath));
      }
      return;
    }
    await this.#tolerate(() =>
      this.#fs.truncate(paths.commandsPath, confirmed.commands),
    );
    await this.#tolerate(() =>
      this.#fs.truncate(paths.eventsPath, confirmed.events),
    );
  }

  async #tolerate(work: () => Promise<void>): Promise<void> {
    try {
      await work();
    } catch {
      // See `#rollback`: a repair that cannot run leaves the Hand incomplete,
      // which is a state the reader already has to handle.
    }
  }
}
