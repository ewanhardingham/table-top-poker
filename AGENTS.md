# table-top-poker

## Code comments

Code documents itself through names, types, and structure. Reach for a clearer
name or a smaller function before reaching for a comment. A comment is a last
resort, and a rare one.

Write an inline comment only when the reasoning is genuinely non-obvious *and*
has nowhere better to live — and even then keep it to a line. Everything with a
home elsewhere goes there instead:

- Business logic, domain rules, and design rationale live in `CONTEXT.md`,
  `docs/adr/`, or `docs/design/`. Reference the decision (`ADR-0002`, issue
  number), don't restate it inline.
- Machine-readable directives that must sit in the code stay — `eslint-disable`,
  `@ts-expect-error`, `prettier-ignore` — each with the reason it's needed.

Do not add comments that restate the code, label sections, narrate the obvious,
or duplicate a type or name. When you touch a file, delete such comments you
find.

## Commit convention

This repository uses [Conventional Commits](https://www.conventionalcommits.org/). Every commit message must start with a type, an optional scope, and a description:

```
<type>(<optional scope>): <description>
```

Types in use: `feat`, `fix`, `docs`, `refactor`, `test`, `chore`, `build`, `ci`, `perf`, `style`, `revert`.

- Description in the imperative mood, lower case, no trailing full stop.
- Scope is optional and names the area touched — e.g. `engine`, `server`, `table`, `player`, `research`.
- Breaking changes take a `!` before the colon (`feat(engine)!: …`) and a `BREAKING CHANGE:` footer.

Whether this is enforced by tooling, and whether it drives versioning or a changelog, is still open — see [Development workflow, CI and testing strategy](https://github.com/ewanhardingham/table-top-poker/issues/4).

## Development workflow

This repository has a single contributor and does not use pull requests. Every
feature runs through the same loop.

1. **A worktree per feature.** Branch off `main` (or off the unmerged branch the
   work builds on) into a sibling directory named for the branch:

   ```bash
   git worktree add -b fix/keep-board-on-foldout ../ttp-fix-keep-board-on-foldout main
   ```

   Name the branch for the change (`fix/keep-board-on-foldout`,
   `feat/147-coaching-hints`). Work in the worktree; never commit onto whatever
   branch happens to be checked out. Run `npm install` and `npm run build` in a
   fresh worktree before running anything — without both, `tsc` and the
   component tests resolve packages from the main checkout and fail in
   confusing ways (duplicate React, null hooks).

2. **Commit every change.** Each coherent change gets its own Conventional
   Commit before moving on. Leave no work uncommitted at the end of a step.

3. **Refresh the dev servers.** After a change lands in the working tree, run
   `make dev-tailscale` from that worktree so the human can look at it. The
   servers bind fixed ports (3000, 5173, 5174), so only one worktree serves at a
   time — starting from a new worktree stops the previous set. Use
   `make dev-status` to see what is running and `make dev-stop` to shut it down.

4. **Run the targeted tests.** Run only the test file(s) covering the code you
   changed (e.g. `npx vitest run packages/server/src/rooms.test.ts`), plus a
   typecheck/build where the change warrants it. CI runs the full suite on every
   push and is the source of truth for the complete run.

5. **Promote to remote `main` only when asked.** Do not push work-in-progress
   branches; the human reviews the branch locally. When the human asks for the
   branch to be promoted, run the full gate first — `npm test`, `npm run lint`
   (eslint plus `prettier --check`), and `npm run build` — and stop and report
   if any of it fails. Then rebase onto the latest `main`, fast-forward `main`
   onto the branch, and push:

   ```bash
   git fetch origin && git rebase origin/main
   git -C /home/ewan/dev/table-top-poker switch main && git merge --ff-only <branch>
   git push origin main
   ```

6. **Tidy up once it has landed.** After the commits are on remote `main`,
   remove the worktree and delete the branch:

   ```bash
   git worktree remove ../ttp-<branch>
   git branch -d <branch>
   ```

   Then confirm with `git worktree list` and `git branch` that nothing stale is
   left behind.

## Planning

Foundational decisions live on the wayfinder map, [issue #1](https://github.com/ewanhardingham/table-top-poker/issues/1). Read its Notes for the standing constraints before proposing architecture; its open child issues are the decisions still to make.

## Agent skills

### Issue tracker

Issues and PRDs live as GitHub issues in `ewanhardingham/table-top-poker`, managed with the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

The five canonical triage roles, each using its default label string (`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`). See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: one `CONTEXT.md` and one `docs/adr/` at the repo root, both created lazily. See `docs/agents/domain.md`.

## Raspberry Pi deployment

When the human asks to deploy a new app version to the Raspberry Pi, use the
`raspberrypi` SSH host alias and follow the release workflow in
`docs/deploy-pi.md`:

1. Work from the checkout containing the requested commit. Inspect `git status`
   and do not deploy unrelated or uncommitted changes without explicit
   approval.
2. Confirm the commit's CI full-suite run passed, then build and verify locally
   with `npm ci`, the relevant targeted test files, `npm run lint`, and
   `npm run build:release`. The release must be built on the development
   machine; do not build TypeScript or run `npm install` on the Pi.
3. Before restarting, warn that the server keeps rooms and hands in memory, so
   deployment ends active games. Do not restart during an active game unless
   the human explicitly approves it.
4. Upload `.release/` to a new timestamped directory and switch the symlink:

   ```bash
   RELEASE=/opt/poker/releases/$(date +%Y%m%d-%H%M%S)
   ssh raspberrypi "mkdir -p '$RELEASE'"
   rsync -az --delete .release/ "raspberrypi:$RELEASE/"
   ssh raspberrypi "sudo chown -R poker:poker '$RELEASE' && \
     sudo ln -sfn '$RELEASE' /opt/poker/current && \
     sudo systemctl restart poker && \
     sudo systemctl is-active poker"
   ```

5. Verify the selected release, service status, recent journal output, and LAN
   HTTP response from `http://192.168.1.116:3000/`.
6. If `deploy/poker.service` changed, install it into
   `/etc/systemd/system/poker.service`, run `sudo systemctl daemon-reload`, and
   restart the service. Do not change `/etc/poker/poker.env` unless requested.
7. Keep older release directories. To roll back, point
   `/opt/poker/current` at a known-good release and restart `poker`.

Use `docs/deploy-pi.md` as the source of truth if these instructions and the
deployment layout diverge. Report the deployed commit/release path and the
post-deploy verification result to the human.

