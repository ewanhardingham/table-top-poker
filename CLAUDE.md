# table-top-pocker

## Commit convention

This repository uses [Conventional Commits](https://www.conventionalcommits.org/). Every commit message must start with a type, an optional scope, and a description:

```
<type>(<optional scope>): <description>
```

Types in use: `feat`, `fix`, `docs`, `refactor`, `test`, `chore`, `build`, `ci`, `perf`, `style`, `revert`.

- Description in the imperative mood, lower case, no trailing full stop.
- Scope is optional and names the area touched — e.g. `engine`, `server`, `table`, `player`, `research`.
- Breaking changes take a `!` before the colon (`feat(engine)!: …`) and a `BREAKING CHANGE:` footer.

Whether this is enforced by tooling, and whether it drives versioning or a changelog, is still open — see [Development workflow, CI and testing strategy](https://github.com/ewanhardingham/table-top-pocker/issues/4).

## Planning

Foundational decisions live on the wayfinder map, [issue #1](https://github.com/ewanhardingham/table-top-pocker/issues/1). Read its Notes for the standing constraints before proposing architecture; its open child issues are the decisions still to make.

## Agent skills

### Issue tracker

Issues and PRDs live as GitHub issues in `ewanhardingham/table-top-pocker`, managed with the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

The five canonical triage roles, each using its default label string (`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`). See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: one `CONTEXT.md` and one `docs/adr/` at the repo root, both created lazily. See `docs/agents/domain.md`.
