import type { RoomOperation, RoomRecording } from "@table-top-poker/recording";
import type { DispatchTransaction } from "./rooms.js";

export interface PausedRoom {
  readonly operation: RoomOperation;
  readonly transaction?: DispatchTransaction;
  readonly onSettled?: () => void;
}

export type RetryOutcome = "resumed" | "still-paused" | "not-paused";
export type ContinueOutcome = "resumed" | "not-paused";

export interface RoomRecordingsPorts {
  /** Stops the Actor's clock and any pending bot action, without arming a replacement. */
  suspend(code: string): void;
  /** Settles whatever the pause retained, exactly as a live dispatch would. */
  resume(code: string, paused: PausedRoom): void;
  announce(code: string, event: "paused" | "resumed" | "stopped"): void;
  logError(code: string, message: string, error?: unknown): void;
}

/**
 * Every Room's open recording and the paused state a failed append puts it in
 * — see Recording and recording-paused in `docs/design/server.md`. Owns the
 * three pieces of state that move together: the open writers, the operation a
 * paused Room retains, and the Rooms that have stopped recording for good.
 */
export class RoomRecordings {
  readonly #open = new Map<string, RoomRecording>();
  readonly #paused = new Map<string, PausedRoom>();
  readonly #stopped = new Set<string>();
  readonly #ports: RoomRecordingsPorts;

  constructor(ports: RoomRecordingsPorts) {
    this.#ports = ports;
  }

  open(code: string, recording: RoomRecording): void {
    this.#open.set(code, recording);
  }

  isPaused(code: string): boolean {
    return this.#paused.has(code);
  }

  hasStopped(code: string): boolean {
    return this.#stopped.has(code);
  }

  /** Appends one whole operation, answering whether it is confirmed on disk. */
  async append(code: string, operation: RoomOperation): Promise<boolean> {
    if (this.#stopped.has(code)) return true;
    const recording = this.#open.get(code);
    if (recording === undefined) {
      this.#ports.logError(code, "dispatch in a room with no recording");
      return true;
    }
    try {
      await recording.append(operation);
      return true;
    } catch (error) {
      this.#ports.logError(code, "recording append failed", error);
      return false;
    }
  }

  /** Blocks the Room on a failed append, retaining what could not be recorded. */
  pause(
    code: string,
    operation: RoomOperation,
    settled: Omit<PausedRoom, "operation"> = {},
  ): void {
    if (this.#paused.has(code)) {
      // Every mutation route checks `isPaused` first, so a second pause is a
      // bug; refusing keeps the first retained operation rather than losing it.
      this.#ports.logError(code, "recording paused again while paused");
      return;
    }
    this.#ports.suspend(code);
    this.#paused.set(code, { operation, ...settled });
    this.#ports.announce(code, "paused");
  }

  async retry(code: string): Promise<RetryOutcome> {
    const paused = this.#paused.get(code);
    if (paused === undefined) return "not-paused";
    const recording = this.#open.get(code);
    if (recording === undefined) {
      this.#ports.logError(code, "retry attempted with no recording");
      return "still-paused";
    }

    try {
      await recording.retry(paused.operation);
    } catch (error) {
      this.#ports.logError(code, "recording retry failed", error);
      return "still-paused";
    }

    this.#paused.delete(code);
    this.#ports.resume(code, paused);
    this.#ports.announce(code, "resumed");
    return "resumed";
  }

  async continueWithout(code: string): Promise<ContinueOutcome> {
    const paused = this.#paused.get(code);
    if (paused === undefined) return "not-paused";
    this.#paused.delete(code);
    this.#stopped.add(code);

    const recording = this.#open.get(code);
    this.#open.delete(code);
    if (recording !== undefined) {
      try {
        await recording.close();
      } catch (error) {
        this.#ports.logError(code, "recording close failed", error);
      }
    }

    this.#ports.resume(code, paused);
    this.#ports.announce(code, "stopped");
    return "resumed";
  }

  /** Drains and closes one Room's recording; what is on disk stays there. */
  async drain(code: string): Promise<void> {
    const pausedOperation = this.#paused.get(code)?.operation;
    const recording = this.#open.get(code);
    if (recording === undefined) return;
    this.#open.delete(code);
    try {
      await recording.discardLatched(pausedOperation);
      await recording.close();
    } catch (error) {
      this.#ports.logError(code, "recording close failed", error);
    }
  }

  async drainAll(): Promise<void> {
    await Promise.all([...this.#open.keys()].map((code) => this.drain(code)));
  }

  /** Discards a Room's retained transaction and forgets it entirely. */
  async forget(code: string): Promise<void> {
    this.#paused.get(code)?.transaction?.discard();
    // Drains before forgetting the pause: the retained operation is what
    // `discardLatched` restores the confirmed tail against.
    await this.drain(code);
    this.#paused.delete(code);
    // A future Room may collide on this join code once it is re-rolled —
    // leaving this set would start it already believing it has no recording.
    this.#stopped.delete(code);
  }
}
