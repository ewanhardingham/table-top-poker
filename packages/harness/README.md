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

## Replay

A recorded hand *is* its input command stream, not the output. To check a
hand replays identically, re-pipe the same file and diff:

```sh
cat commands.jsonl | npx harness > run1.jsonl
cat commands.jsonl | npx harness > run2.jsonl
diff run1.jsonl run2.jsonl && echo "identical"
```

## Failure modes

The harness fails fast on malformed input rather than risk writing a
corrupt record into the output stream: invalid JSON on a line, a command
`type` the engine doesn't recognize, or a malformed `--seats` value all
print a message to stderr and exit non-zero, with nothing further written
to stdout.
