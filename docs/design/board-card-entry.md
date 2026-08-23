# Board card entry: only new cards deal in

The table's community cards animate in one at a time. The animation must fire
for a card the moment it arrives on the felt, and never again.

Two things used to make it fire again:

- **Cards were keyed by board position.** A card at index 2 that changed
  identity — or a list React chose to reconcile by index — replayed its deal.
- **`Board` returned a structurally different tree per phase.** Crossing
  betting → showdown moved `CommunityCards` to a new position in the element
  tree, remounting it and re-dealing all five cards that were already down.

The fix, settled on `prototype/replay-transport` (wayfinder #82, ticket #117):

- Key each card by its rank and suit (`cardKey`), so a card already on the felt
  is never remounted.
- Remember which cards were on the felt when the render began, and give the
  entry animation only to cards whose key is not among them (`dealBoard`). The
  stagger is measured from the first *new* card, so a lone turn card lands
  immediately instead of waiting out three flop cards' delays. The prototype
  compared counts rather than keys, which silently skipped the deal whenever
  the board shrank and refilled — a 5-card river giving way to the next hand's
  flop. Scrubbing a replay does exactly that, so this version compares keys.
- Render one shape for every phase that has a hand, so `CommunityCards` keeps
  its position in the tree as the phase changes.

A folded-out hand keeps whatever community cards were already dealt. The table
does not replace them with a winner banner: the player devices still show the
winner in their own hand status.

The remount behaviour is invisible in live play, where the board only ever
grows one street at a time, and obvious the moment a replay is scrubbed
backwards and forwards. This change is the prefactor the replay scrub consumes.
