# Table-top Poker

A Texas hold'em game played across two screens: one central device shows the
shared table, and each player uses their own phone for their cards and
actions. It is built to run on a small local network, where a Raspberry Pi in
the corner of the room serves the whole game.

The shared vocabulary (Room, Table, Player, Seat, and the rest) is defined in
[CONTEXT.md](CONTEXT.md).

## Running it locally

You need Node 22.

```bash
npm install
make dev
```

That starts three servers: the table display, the player client, and the
backend. The command prints the URLs when it finishes.

Open the table URL on the device you want to use as the table, and the player
URL on each phone.

If your phones are on a different network from your machine, `make dev` on its
own will not be reachable from them. Use one of these instead:

| Command             | Use it when                                    |
| ------------------- | ---------------------------------------------- |
| `make dev`          | Everything is on one machine (default)         |
| `make dev-wsl`      | Running under WSL2 and connecting from the LAN |
| `make dev-tailscale`| Reaching the app over Tailscale                |

Run `make help` to see the rest, and `make dev-stop` to stop the servers.

### Everyday commands

```bash
npm test          # run the test suite
npm run lint      # eslint and prettier
npm run build     # typecheck and compile every package
```

## Deploying

The app is designed to run on a Raspberry Pi on your local network. Build the
release on your development machine, never on the Pi:

```bash
npm run build:release
```

This produces `.release/`, a self-contained folder holding the server and both
client bundles, served by a single process.

Copy that folder to the Pi and restart the service. The full walkthrough,
including first-time Pi setup and how to roll back, is in
[docs/deploy-pi.md](docs/deploy-pi.md).

Note that the server keeps rooms and hands in memory, so deploying ends any
game in progress.

## Contributing

This is a personal project with a single maintainer, so the workflow is
deliberately small.

If you are not the maintainer, please fork the repository and open a pull
request. You will not be able to push to this repository directly.

A few things that make a change easy to accept:

- Write commit messages as [Conventional Commits](https://www.conventionalcommits.org/),
  for example `fix(engine): correct side pot split`.
- Do the work on a branch named for the change, not on `main`.
- Run `npm test` and `npm run lint` before you open the pull request.
- Keep comments rare. Prefer a clearer name or a smaller function. Design
  decisions belong in `CONTEXT.md` or `docs/adr/`, not inline.

The conventions are described in full in [CLAUDE.md](CLAUDE.md). Issues and
plans are tracked as GitHub issues.
