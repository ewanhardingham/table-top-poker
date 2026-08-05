# UI design prototype (historical)

> **Superseded — kept for reference only.** This prototype seeded the Phase 1
> visual design pass and has since drifted from what ships. It is not a spec for
> anything: where it and the shipped clients disagree, the shipped clients are
> right. Don't reconcile new work against it, and don't cite it as the source of
> truth for a token, layout, or copy string.

Source: [Table Top Poker](https://claude.ai/design/p/0bfbf4f5-fb32-4e3a-bc8a-1846be21c6a5?file=Table+Top+Poker.dc.html), a Claude Design project from the design team.

- `table-top-poker-prototype.dc.html` — the interactive mock, covering both the table client (iPad landscape) and player client (phone): room create/join with QR, seat picking, house rules settings, live board/seats/actor state, hole cards, action bar, and showdown.
- `support.js` — generated runtime the prototype's `.dc.html` depends on. Do not hand-edit; re-pull from the design project if it changes.

It was referenced by [Map: visual design pass for the Phase 1 table and player clients](https://github.com/ewanhardingham/table-top-poker/issues/57) and its tickets, all now closed. The prototype's own JS state machine (bot fill, hand simulation) was demo scaffolding, not a spec for the real engine/server — the real clients get their state from the server via the existing WebSocket protocol.

Known divergences, as a warning against following it: it drew dark/red blind
markers and a combined `D-SB` heads-up chip in a row layout, none of which
reflects the decisions actually taken (issue #160). Its palette values likewise
seeded `packages/ui-shared/src/theme.ts` but no longer match it.

The `packages/player-client/src/prototype/` directory is unrelated to this — it
is the live hole-card interaction prototype from the Phase 3 work, and is
current.
