import path from "node:path";
import { nodeFileSystem } from "./file-system.js";
import type { RecordingFileSystem } from "./file-system.js";
import { readHandRecording } from "./hand-reader.js";
import type { HandRecordingRead } from "./hand-reader.js";
import { assertValidRoomId, roomManifestPath } from "./paths.js";
import { RECORDING_LAYOUT_VERSION } from "./records.js";
import type { RoomManifest } from "./records.js";
import { RoomRecording } from "./room-recording.js";

export interface CreateRoomRecordingOptions {
  /** The Room's durable opaque id — never its four-character join code. */
  readonly roomId: string;
  /** The live join code, or null for a recording that was never joinable. */
  readonly code: string | null;
  readonly createdAt: string;
}

/**
 * Where Room recordings are created. A seam rather than a bare function so
 * the server can hold one for the process, and so tests can hand `buildApp`
 * a recordings root backed by an in-memory filesystem — there is deliberately
 * no way to hand it *nothing*, because recording is a Room invariant.
 */
export interface Recordings {
  create(options: CreateRoomRecordingOptions): Promise<RoomRecording>;
  /**
   * Reads one Hand of an already-created Room recording back.
   *
   * On the root rather than on {@link RoomRecording} deliberately: a
   * recording on disk outlives its writer. "Continue without recording"
   * closes the writer and never reopens it, and the Hands recorded before
   * that failure must stay replayable (Phase 2 spec #129 §3).
   */
  readHand(roomId: string, handOrdinal: number): Promise<HandRecordingRead>;
}

const WRITE_PROBE_FILENAME = ".recordings-write-probe";

/** The recordings root, `<RECORDINGS_DIR>`, and the Room directories under it. */
export class DirectoryRecordings implements Recordings {
  readonly root: string;
  readonly #fs: RecordingFileSystem;
  readonly #retries: number | undefined;

  constructor(
    root: string,
    fileSystem: RecordingFileSystem = nodeFileSystem,
    retries?: number,
  ) {
    this.root = root;
    this.#fs = fileSystem;
    this.#retries = retries;
  }

  /**
   * Creates the root and proves it accepts a write, throwing if it does not.
   * The server calls this before it listens and refuses to start on failure:
   * a Room that cannot be recorded must never become joinable, and an
   * unwritable disk found at the first hand is found far too late.
   */
  async ensureWritable(): Promise<void> {
    const probe = path.join(this.root, WRITE_PROBE_FILENAME);
    try {
      await this.#fs.mkdir(this.root);
      await this.#fs.writeFile(probe, "");
      await this.#fs.remove(probe);
    } catch (cause) {
      throw new Error(`recordings root ${this.root} is not writable`, {
        cause,
      });
    }
  }

  /**
   * Opens a Room's recording by writing its immutable `room.json`. Resolving
   * is the caller's licence to publish the Room; rejecting leaves no
   * directory behind and must leave no joinable Room either.
   *
   * The manifest is published by rename, so a concurrent reader sees either
   * no `room.json` or a complete one, never a half-written document.
   */
  async create(options: CreateRoomRecordingOptions): Promise<RoomRecording> {
    assertValidRoomId(options.roomId);
    const roomDir = path.join(this.root, options.roomId);
    const manifest: RoomManifest = {
      layoutVersion: RECORDING_LAYOUT_VERSION,
      roomId: options.roomId,
      code: options.code,
      createdAt: options.createdAt,
    };
    const manifestPath = roomManifestPath(roomDir);
    const stagingPath = `${manifestPath}.tmp`;

    // `room.json` is immutable, so a directory that already has one is a
    // finished recording — never something to reopen or write over. The
    // server's ids are UUIDs and cannot collide, but the harness takes
    // `--room-id` from argv and a developer will reuse one.
    if (await this.#fs.exists(manifestPath)) {
      throw new Error(
        `could not create the recording for room ${options.roomId}: ${manifestPath} already exists`,
      );
    }
    const directoryExisted = await this.#fs.exists(roomDir);

    try {
      await this.#fs.mkdir(roomDir);
      await this.#fs.writeFile(stagingPath, JSON.stringify(manifest) + "\n");
      await this.#fs.rename(stagingPath, manifestPath);
    } catch (cause) {
      // Roll back only what this call could have created. Removing `roomDir`
      // outright would be a recursive delete of whatever was already there.
      await this.#tolerate(() => this.#fs.remove(stagingPath));
      if (!directoryExisted) {
        await this.#tolerate(() => this.#fs.remove(roomDir));
      }
      throw new Error(
        `could not create the recording for room ${options.roomId}`,
        { cause },
      );
    }

    return new RoomRecording({
      roomId: options.roomId,
      roomDir,
      fileSystem: this.#fs,
      ...(this.#retries === undefined ? {} : { retries: this.#retries }),
    });
  }

  readHand(roomId: string, handOrdinal: number): Promise<HandRecordingRead> {
    assertValidRoomId(roomId);
    return readHandRecording({
      fileSystem: this.#fs,
      roomDir: path.join(this.root, roomId),
      handOrdinal,
    });
  }

  /**
   * A rollback is itself a write on the filesystem that just refused one.
   * The create is failing either way, and that failure is what keeps the Room
   * unjoinable, so a repair that cannot run must not mask it.
   */
  async #tolerate(work: () => Promise<void>): Promise<void> {
    try {
      await work();
    } catch {
      // Deliberately swallowed — see above.
    }
  }
}
