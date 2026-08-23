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

## Branching and merging

This repository has a single contributor and does not use pull requests.

- Do the work on a branch, in a worktree where it keeps parallel tasks isolated.
  Name the branch for the change (`fix/keep-board-on-foldout`, `feat/147-coaching-hints`).
  Never commit onto whatever branch happens to be checked out.
- Where the work builds on an unmerged branch, branch off *that* branch.
- Do not open pull requests, and do not push work-in-progress branches for review.
  The human reviews the branch locally.
- Once the human is happy, the commits go straight to `main`. Only the human
  merges and pushes to `main` unless they explicitly ask you to do it.

## Planning

Foundational decisions live on the wayfinder map, [issue #1](https://github.com/ewanhardingham/table-top-poker/issues/1). Read its Notes for the standing constraints before proposing architecture; its open child issues are the decisions still to make.

## Agent skills

### Issue tracker

Issues and PRDs live as GitHub issues in `ewanhardingham/table-top-poker`, managed with the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

The five canonical triage roles, each using its default label string (`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`). See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: one `CONTEXT.md` and one `docs/adr/` at the repo root, both created lazily. See `docs/agents/domain.md`.

## Local testing

Run only the test file(s) covering the code you've changed locally (e.g.
`npx vitest run packages/server/src/rooms.test.ts`), never the full suite.
CI runs the full suite on every push and is the source of truth for the
complete test run. Before finishing a task, run the relevant targeted tests,
typecheck/build, and lint as appropriate; do not run `npm test` unless the
human explicitly asks for a full local run.

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

