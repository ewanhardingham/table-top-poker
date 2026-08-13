import path from "node:path";
import { nodeFileSystem } from "./file-system.js";
import type { RecordingFileSystem } from "./file-system.js";
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

    try {
      await this.#fs.mkdir(roomDir);
      await this.#fs.writeFile(
        `${manifestPath}.tmp`,
        JSON.stringify(manifest) + "\n",
      );
      await this.#fs.rename(`${manifestPath}.tmp`, manifestPath);
    } catch (cause) {
      try {
        await this.#fs.remove(roomDir);
      } catch {
        // The rollback is a write on the filesystem that just refused one.
        // The create still fails, which is what keeps the Room unjoinable.
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
}
