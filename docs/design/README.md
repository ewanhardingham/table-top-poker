# UI design prototype

Source: [Table Top Poker](https://claude.ai/design/p/0bfbf4f5-fb32-4e3a-bc8a-1846be21c6a5?file=Table+Top+Poker.dc.html), a Claude Design project from the design team.

- `table-top-poker-prototype.dc.html` — the interactive mock, covering both the table client (iPad landscape) and player client (phone): room create/join with QR, seat picking, house rules settings, live board/seats/actor state, hole cards, action bar, and showdown.
- `support.js` — generated runtime the prototype's `.dc.html` depends on. Do not hand-edit; re-pull from the design project if it changes.

Referenced by [Map: visual design pass for the Phase 1 table and player clients](https://github.com/ewanhardingham/table-top-poker/issues/57) and its tickets. The prototype's own JS state machine (bot fill, hand simulation) is demo scaffolding, not a spec for the real engine/server — the real clients get their state from the server via the existing WebSocket protocol.
