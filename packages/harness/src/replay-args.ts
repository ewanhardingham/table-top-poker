const DEFAULT_RECORDINGS_DIR = "./recordings";

export type ReplaySelector =
  | { readonly kind: "all" }
  | { readonly kind: "at"; readonly position: number }
  | { readonly kind: "range"; readonly from: number; readonly to: number };

export interface ReplayArgs {
  readonly room: string;
  readonly hand: number;
  readonly selector: ReplaySelector;
  readonly recordingsDir: string;
}

function requireValue(argv: readonly string[], flag: string): string {
  const index = argv.indexOf(flag);
  if (index === -1) {
    throw new Error(`${flag} is required`);
  }
  const value = argv[index + 1];
  if (value === undefined) {
    throw new Error(`${flag} requires a value`);
  }
  return value;
}

function optionalValue(
  argv: readonly string[],
  flag: string,
): string | undefined {
  const index = argv.indexOf(flag);
  if (index === -1) return undefined;
  const value = argv[index + 1];
  if (value === undefined) {
    throw new Error(`${flag} requires a value`);
  }
  return value;
}

function parseOrdinal(flag: string, value: string): number {
  if (!/^\d+$/.test(value)) {
    throw new Error(`${flag} must be a non-negative integer`);
  }
  return Number.parseInt(value, 10);
}

function parseSelector(argv: readonly string[]): ReplaySelector {
  const at = optionalValue(argv, "--at");
  const from = optionalValue(argv, "--from");
  const to = optionalValue(argv, "--to");

  if (at !== undefined) {
    if (from !== undefined || to !== undefined) {
      throw new Error("--at cannot be combined with --from/--to");
    }
    return { kind: "at", position: parseOrdinal("--at", at) };
  }

  if (from !== undefined || to !== undefined) {
    if (from === undefined || to === undefined) {
      throw new Error("--from and --to must be given together");
    }
    const fromOrdinal = parseOrdinal("--from", from);
    const toOrdinal = parseOrdinal("--to", to);
    if (fromOrdinal > toOrdinal) {
      throw new Error("--from must not be greater than --to");
    }
    return { kind: "range", from: fromOrdinal, to: toOrdinal };
  }

  return { kind: "all" };
}

/**
 * Parses `harness replay <room> --hand <n> [--at <n> | --from <n> --to <m>]
 * [--recordings-dir <dir>]`. `argv` is everything after the `replay` token.
 */
const REPLAY_FLAGS = ["--hand", "--at", "--from", "--to", "--recordings-dir"];

export function parseReplayArgs(
  argv: readonly string[],
  env: Readonly<Record<string, string | undefined>> = process.env,
): ReplayArgs {
  const room = argv[0];
  // Only a recognized flag in the room slot is a missing-<room> mistake — a
  // Room ID is otherwise free-form (`assertValidRoomId` permits a leading
  // hyphen), so a stricter "starts with --" check would reject a real one.
  if (room === undefined || REPLAY_FLAGS.includes(room)) {
    throw new Error("harness replay requires a <room> argument");
  }

  const hand = parseOrdinal("--hand", requireValue(argv, "--hand"));
  const selector = parseSelector(argv);
  const recordingsDir =
    optionalValue(argv, "--recordings-dir") ??
    env.RECORDINGS_DIR ??
    DEFAULT_RECORDINGS_DIR;

  return { room, hand, selector, recordingsDir };
}
