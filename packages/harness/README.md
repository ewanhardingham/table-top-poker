# @table-top-poker/harness

A line-delimited JSON CLI over the engine: commands in via stdin (one per
line), events/rejections out via stdout (one per line), folding each event
into state via `apply` as it's produced. See Phase 1 spec #130 §3.

## Build

From the repo root:

```sh
npm run build
```

## Run

Pipe a command file through it:

```sh
cat packages/harness/fixtures/hand-1.commands.jsonl | npx harness
```

`npx harness` resolves the workspace-linked `harness` bin
(`packages/harness/dist/cli.js`) once the workspace is built; no global
install needed. Equivalently: `node packages/harness/dist/cli.js`.

By default the harness seats players `0, 1, 2`. Pick a different seating
with `--seats`:

```sh
cat commands.jsonl | npx harness --seats 0,1,2,3
```

Each line of `commands.jsonl` is a JSON-encoded `Command`, e.g.:

```jsonl
{"type":"startHand","seatId":0,"seed":"seed-1"}
{"type":"call","seatId":1}
{"type":"raise","seatId":2}
```

Output is one JSON `HandEvent` or `Rejection` per line — a `Rejection` is
distinguishable by `"type":"Rejection"`.

## Play turn by turn

Run it with no input redirected and it reads your terminal directly —
type one JSON command per line, and that line's events (or rejection)
print immediately, before you type the next one:

```sh
npx harness
```

Ctrl-D (EOF) ends the session.

## Replay

A recorded hand *is* its input command stream, not the output. To check a
hand replays identically, re-pipe the same file and diff:

```sh
cat commands.jsonl | npx harness > run1.jsonl
cat commands.jsonl | npx harness > run2.jsonl
diff run1.jsonl run2.jsonl && echo "identical"
```

## Room recording

Pass `--recordings-dir` to have the harness write a Room recording as it
plays, append-as-you-go, in exactly the layout the server writes (Phase 2
spec #129 §3) — so the dev stepper can read what the harness just produced:

```sh
cat commands.jsonl | npx harness --recordings-dir ./recordings --room-id friday-room
```

This produces `./recordings/friday-room/`, containing an immutable
`room.json` written before the first command is read, and per hand a
`hand-0001.context.json` sidecar, `hand-0001.commands.jsonl` and
`hand-0001.events.jsonl`.

A harness run has no live Room, so it synthesises one: `--room-id` is the
**Room ID**, defaulting to a sortable UTC timestamp and required to be a safe
path segment (`[A-Za-z0-9._-]+`), and `room.json`'s `code` is `null` — a
recording that was never joinable through a join code.

Recording stays optional here. The always-on Room invariant binds the server,
which hosts players who would not otherwise know whether their session is
being recorded; it does not bind a developer piping commands through a CLI.

Each recorded line is exactly the `Command`/`HandEvent`/`Rejection` JSON the
harness reads or writes on stdin/stdout, plus one extra field: `v`, the
schema version tag (`ENGINE_LOG_VERSION` from `@table-top-poker/engine`).
Old recordings stay interpretable against the build they were written by even
after a later schema change bumps the tag for new ones. Because the extra
field is additive, a recorded `*.commands.jsonl` file re-pipes through the
harness exactly like a plain command file — the replay procedure above works
unmodified on it:

```sh
cat recordings/friday-room/hand-0001.commands.jsonl | npx harness --seats 0,1,2
```

Seating isn't recorded in the command stream itself (it's fixed for a run's
whole life, set by `--seats` at startup) — replaying a recorded run requires
passing the same `--seats` it was originally run with. Each hand's
`*.context.json` sidecar records the participating seats and starting button
for a human or later replay tooling to read back; the harness CLI itself
doesn't consume it.

## Resolving `<room>` in the dev stepper

The `<room>` positional resolves in this order: a literal path; a Room ID
directly under `--recordings-dir`; then a four-character join code scanned
across `--recordings-dir`, most recent `createdAt` winning a collision because
codes are recycled; and finally the literal `latest`. A directory that exists
always wins over a code scan, so a directory that happens to share a code's
shape is never misread as one. The Room ID check is what makes the ID a
harness run just printed usable as-is, without spelling out the path.

The scan is deliberately unfiltered by layout version: `latest` and a join code
pick the directory the timestamp actually names first and validate it second.
Silently preferring an older, version-compatible directory would be the
partial-replay-for-a-version-mismatch that the spec rules out, moved a step
earlier.

## Failure modes

The harness fails fast on malformed input rather than risk writing a
corrupt record into the output stream: invalid JSON on a line, a command
`type` the engine doesn't recognize, or a malformed `--seats` value all
print a message to stderr and exit non-zero, with nothing further written
to stdout.

### An all-torn first Command line

`harness replay` treats any torn final JSONL record as incomplete, never as
corrupt, and that carries no carve-out for the record being the Hand's first.
When the first Command line is torn, `replayHand` has nothing to replay and
reports `invalid-command-log: empty` — correct when the log really is empty,
but indistinguishable there from a crash mid-write of the first line. The CLI
reclassifies that one failure shape and emits the single position the Hand
context alone still supports: position 0, the starting state, with the usual
incomplete-Hand warning on stderr. It is the only failure the harness
reclassifies rather than passing straight through, and reaching it means
`replayHand` already validated the context and version.
