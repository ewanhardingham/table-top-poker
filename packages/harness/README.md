# @table-top-poker/harness

A line-delimited JSON CLI over the engine: commands in via stdin (one per
line), events/rejections out via stdout (one per line), folding each event
into state via `apply` as it's produced. See `docs/phase-1-spec.md` §3.

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
{"type":"startHand","playerId":0,"seed":"seed-1"}
{"type":"call","playerId":1}
{"type":"raise","playerId":2}
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

## Persistence

Pass `--log-dir` to have the harness write both the command stream (ground
truth for replay) and the event stream (audit trail) to disk as it plays,
append-as-you-go — see `docs/phase-1-spec.md` §5:

```sh
cat commands.jsonl | npx harness --log-dir ./logs --game-id friday-game
```

This produces, per hand, `./logs/friday-game/hand-0001.commands.jsonl` and
`./logs/friday-game/hand-0001.events.jsonl`, plus a `game.jsonl` manifest
recording the seating once. `--game-id` defaults to a sortable UTC
timestamp if omitted, and must be a safe path segment
(`[A-Za-z0-9._-]+`).

Each logged line is exactly the `Command`/`HandEvent`/`Rejection` JSON the
harness reads or writes on stdin/stdout, plus one extra field: `v`, the
schema version tag (`ENGINE_LOG_VERSION` from `@table-top-poker/engine`).
Old logs stay interpretable against the build they were written by even
after a later schema change bumps the tag for new ones. Because the extra
field is additive, a persisted `*.commands.jsonl` file re-pipes through
the harness exactly like a plain command file — the replay procedure
above works unmodified on a logged file:

```sh
cat logs/friday-game/hand-0001.commands.jsonl | npx harness --seats 0,1,2
```

Seating isn't recorded in the command stream itself (it's fixed for a
game's whole life, set by `--seats` at startup) — replaying a logged game
requires passing the same `--seats` it was originally run with. The
`game.jsonl` manifest records the seating for a human or later replay
tooling to read back; the harness CLI itself doesn't consume it.

## Failure modes

The harness fails fast on malformed input rather than risk writing a
corrupt record into the output stream: invalid JSON on a line, a command
`type` the engine doesn't recognize, or a malformed `--seats` value all
print a message to stderr and exit non-zero, with nothing further written
to stdout.
