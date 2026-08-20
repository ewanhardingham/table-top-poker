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
 * One Room's durable recording — see Room recording in `CONTEXT.md` and
 * recording-paused in `docs/design/server.md`. Callers hand it whole
 * operations; it owns everything from version tagging to a clean close.
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

  /** Resolves once confirmed on disk; rejects leaving the files as they were. */
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

  /** Truncates to confirmed offsets first: the failed attempt's own rollback may also have failed. */
  retry(operation: RoomOperation): Promise<void> {
    if (this.#closing) {
      return Promise.reject(
        new Error(`recording for room ${this.roomId} is closed`),
      );
    }
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

  /** Best-effort restore to confirmed offsets; a no-op when never latched. */
  async discardLatched(operation: RoomOperation | undefined): Promise<void> {
    if (this.#closing) {
      throw new Error(`recording for room ${this.roomId} is closed`);
    }
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

  /** Repairs are themselves writes, so failures are swallowed — the caller already reports failure. */
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
