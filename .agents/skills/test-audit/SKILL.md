---
name: test-audit
description: "Guide test authoring and requested test audits in table-top-poker, identifying low-value, implementation-coupled, or duplicative tests and unnecessary test-only production seams."
---

# Test Audit

Adapted from [OpenClaw's test-audit skill](https://github.com/openclaw/openclaw/tree/main/.agents/skills/test-audit).
Root and scoped `AGENTS.md` instructions govern repository workflow.

Three modes, one value bar. Authoring mode gates every new or changed test at
write time. Audit mode runs focused sweeps of tests that re-assert source,
duplicate stronger proof, couple behavior to implementation, or keep test-only
production seams alive. Continue broad audits as separate coherent follow-up
changes; optimize for confidence, not deletion count. Campaign mode prunes one
whole subsystem's test surface (every test file a package or domain area owns);
before starting one, read [CAMPAIGN.md](CAMPAIGN.md).

## Authoring gate

Before adding any test, answer four questions; a missing answer means do not
add it yet:

1. What observable behavior, invariant, or independent contract does it protect?
2. What credible regression makes it fail?
3. Why does existing coverage not already catch that failure? Each contract has
   one primary test owner at the strongest boundary; another layer needs its
   own distinct risk, such as a transport or lifecycle failure the owner cannot
   reach. Prefer extending a table-driven case or shared fixture over a
   near-duplicate test; consolidate duplicated setup in the same change.
4. Does it need a production seam (export, flag, wrapper, injection hook) that no
   production caller needs? If yes, move the test to the real boundary instead.

Then check the test against every [junk pattern](#junk-patterns); a match fails
the gate unless the [retention bar](#retention-bar) names the contract it
independently guards. A test that would break under behavior-preserving
refactoring is asserting implementation, not behavior; rewrite it at the
owning boundary before landing it.

Bug regression tests must fail on the pre-fix code for the intended reason and
pass after the owner-boundary repair. A regression test that never demonstrably
failed proves the mock, not the fix. One regression at the owner boundary
covers the bug; do not replay the same scenario at every layer it crosses.

## Junk patterns

The shared checklist for both modes: the authoring gate rejects a new test that
matches one, and audits hunt for existing tests that do.

- assertion-free coverage probes;
- self-comparisons and identity copiers;
- copied fixtures, inventories, manifests, or export lists;
- exact source, import, or string greps;
- private predicate or call-shape tests duplicated at real boundaries;
- duplicate invocations of the same contract;
- provider-local replays of shared helpers;
- tests whose only purpose is preserving test-only exports, globals, or wrappers;
- dead production code whose only callers are tests;
- expected values produced by the helper or renderer under test;
- mocks that implement the asserted behavior, or one identical mock standing in
  for different APIs;
- fixtures that supply the receipt, admission, or callback ordering the owner
  should produce, or persistence asserted against a store the path never writes;
- capability tests that restate declared flags instead of exercising the
  delivery or acknowledgement the flag promises;
- negative controls that pass for an unrelated reason, such as a denial from a
  different guard or a rejection the production path never reaches;
- names or fixtures that promise more than the input exercises, such as a
  "retires the window" test asserting the window was not cleared.

## Value bar

Tests justify their maintenance cost by protecting behavior, a credible
regression, or an independently meaningful contract. In an audit, an existing
test that must change for behavior-preserving source reorganization is suspect,
not automatically deletable; the authoring gate still rejects new ones.

Before judging a candidate, read the complete test and production owner, its
entry point, callers, callees, sibling implementations, overlapping tests, CI
routing, and relevant history. Read root and scoped `AGENTS.md` files first.
When the test claims dependency-backed behavior, inspect the dependency source
or types directly.

## Discovery

Keep discovery read-only and report evidence before editing. For broad scope,
group discovery by production ownership; use parallel agents only when authorized:

- poker rules and state transitions (`packages/engine`);
- rooms, sockets, clocks, and bots (`packages/server`, `packages/protocol`);
- table/player clients and shared UI (`packages/table-client`,
  `packages/player-client`, `packages/ui-shared`);
- recording, replay, harness, scripts, and tooling;
- a cross-cutting pattern sweep.

Outside campaign mode, prefer a few high-confidence candidates over a large
speculative inventory. Hunt for the [junk patterns](#junk-patterns).

## Retention bar

Keep a test when it independently enforces a public API, plugin SDK, protocol,
config, migration, storage, security, platform, default, prompt-byte, generated
cross-language, package, release, or architecture contract. Also keep:

- call ordering when order is observable behavior;
- regressions with a credible failure mode;
- source inspection when it is the cheapest independent guard: it fails when
  the contract changes (the user-facing key, byte, or path) and survives an
  identifier-only refactor;
- a retained test that fails on the baseline: treat it as a possible product
  bug, reproduce it, and repair the owner rather than deleting it.

Static or slow is not a deletion reason. A test that resembles implementation
may still be the independent contract; prove otherwise before removing it.

## Candidate evidence

Record every field below before editing. A missing field means the candidate is
not ready for deletion:

- exact test name and location;
- what failure it can actually detect;
- non-test callers of the covered production or support seam;
- stronger remaining owner-boundary proof, or why no proof is needed;
- relevant history and the reason the test or seam exists;
- production or test-support deletion unlocked;
- risk and the focused validation command.

## Edit shape

Choose one coherent owner-boundary batch. Delete obsolete test-only exports,
globals, wrappers, and dead production paths instead of preserving aliases.
Move retained regressions to their canonical owners. Consolidate repeated
package or dependency assertions into one generic contract.

Prefer net-negative production LOC. Do not add replacement tests that restate
the same implementation, and do not convert uncertain candidates into cleanup
to increase deletion counts.

## Validation

Never edit source or tests while Vitest is running in the checkout. Work in
the feature worktree required by `AGENTS.md`, using the repository's Node
version (`.nvmrc`). In a fresh worktree, run `npm install` and `npm run build`
before tests so workspace packages resolve locally.

1. Record a baseline for affected suites before removing coverage. Run the
   smallest owner and sibling test files from the worktree root, for example
   `npx vitest run packages/server/src/rooms.test.ts`. Use `--project engine`
   (or another project name from `packages/*/vitest.config.ts`) when the whole
   package is in scope. Verify the expected files and cases actually ran:
   `passWithNoTests` is enabled, so an empty selection is not proof.
2. For removed source greps or plan assertions, exercise the executable script
   or dry-run that owns the real contract. Use independent expected outcomes
   for poker rules, protocol views, recording/replay, and UI behavior. Keep
   property and exhaustive evaluator tests when they provide distinct proof;
   runtime alone does not make them redundant.
3. Run targeted formatting for changed code, `git diff --check`, and a build
   when source, exports, types, or package boundaries change. Markdown is
   excluded from Prettier here; review skill frontmatter, commands, and local
   links directly. Do not run a repository-wide formatting rewrite.
4. Review the final diff against the candidate evidence and retention bar,
   checking that every retained contract still has an executable owner.
   Inspect `git diff --numstat`; report production/tooling separately from
   tests and test support.
5. Run `make dev-tailscale` after changes as required by `AGENTS.md`. Before
   an authorized promotion to main, run the full gate: `npm test`,
   `npm run lint`, and `npm run build`. Stop and report any failure; do not
   remove tests or weaken gates to make promotion pass. CI remains the full
   suite source of truth for code changes; Markdown-only pushes use the
   documentation skip workflow.

## Landing and continuation

Follow `AGENTS.md`: commit each coherent change with a Conventional Commit
in its feature worktree. Do not push work-in-progress branches. Promote only
when asked: pass the full gate, fetch and rebase onto `origin/main`,
fast-forward the main checkout, and push main. If reconciliation changes code
or tests, rerun affected tests and the full gate before promotion. After the
commits reach remote main, remove this feature worktree and branch; preserve
other worktrees. This repository normally lands directly without PRs.
After landing, refresh from current main and rerun read-only discovery for
the next authorized batch.

## Handoff

Report:

- root cause and removed low-value categories;
- production owner simplifications;
- retained false positives and why they remain valuable;
- focused and full proof actually run;
- production versus test LOC;
- commit, branch, promotion, and cleanup state;
- named follow-ups.
