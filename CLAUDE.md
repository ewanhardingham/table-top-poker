# table-top-poker

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
2. Build and verify locally with `npm ci`, `npm run lint`, `npm test`, and
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

# Claude for Chrome

- Never invoke unless explicitly asked by the human.
- Use `read_page` to get element refs from the accessibility tree
- Use `find` to locate elements by description
- Click/interact using `ref`, not coordinates
- NEVER take screenshots unless explicitly requested by the user
