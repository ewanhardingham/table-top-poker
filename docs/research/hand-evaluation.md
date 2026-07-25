# Research: hand evaluation — build or take a library

Resolves [#6](https://github.com/ewanhardingham/table-top-pocker/issues/6). Part of [#1](https://github.com/ewanhardingham/table-top-pocker/issues/1). Unblocks [#15](https://github.com/ewanhardingham/table-top-pocker/issues/15).

**Question.** For Texas hold'em showdown evaluation in TypeScript — build it or take a library?

**Recommendation.** **Build the evaluator, and use `phe` as a dev-only test oracle.** Roughly 60 lines of engine code, property-tested to exhaustion against a known-good reference in under 20 seconds. Reasoning in [Recommendation](#recommendation) below.

All measurements below were produced by running the libraries locally on Node 22.22.1, not read off a README. Method is given so the numbers can be re-derived.

---

## Summary of the field

| Package | Licence | Last code commit | Runtime deps | Unpacked | TS types | Comparable rank | Made-hand description | Returns the 5 cards |
|---|---|---|---|---|---|---|---|---|
| [`phe`](https://github.com/thlorenz/phe) | MIT | 2018-03-22 | none | 557 KB | none | yes, 1–7462 | category only | no |
| [`@xpressit/winning-poker-hand-rank`](https://github.com/xpressit/winning-poker-hand-rank) | MIT | 2026-04-14 | none | 265 KB | first-party | yes, 1–7462 | category only (incl. `RoyalFlush`) | yes, exactly 5 |
| [`pokersolver`](https://github.com/goldfire/pokersolver) | MIT | 2020-07-20 | none | 162 KB | **none** | **no — category 1–9 only** | **best: "Two Pair, A's & K's"** | **buggy — sometimes 6** |
| [`poker-evaluator`](https://github.com/chenosaurus/poker-evaluator) | ISC | 2020-02-16 | 3 | **130 MB** | yes | yes | category only | no |
| `poker-evaluator-ts` | ISC | 2020-07-23 | 3 | **130 MB** | yes | yes | category only | no |
| [`@pokertools/evaluator`](https://github.com/aaurelions/pokertools) | MIT | 2026-07-03 | none | 579 KB | first-party | yes | not verified | not verified |
| [`poker-tools`](https://github.com/N1ghtly/poker-tools) | MIT | 2018-10-16 | lodash ×2 | 45 KB | none | yes | not verified | not verified |

Licence, dependency, size and date figures come from the npm registry metadata and the GitHub API; the `phe` / `pokersolver` / `@xpressit` licences were additionally confirmed by reading the `LICENSE` files in the installed packages. `phe`'s `LICENSE` opens with "All rights reserved" but the body is verbatim MIT, and `package.json` declares MIT.

**No candidate has a native dependency.** A `find` for `*.node`, `*.gyp` and `binding.gyp` across the installed trees of `phe`, `pokersolver` and `@xpressit` returned nothing — all are pure JavaScript, so all are Raspberry Pi-safe on the architecture axis. The Pi risk is memory, not compilation, and it is confined to the two `poker-evaluator` packages.

Monthly npm downloads (registry API, at time of writing): `pokersolver` 31,647; `phe` 4,227; `poker-evaluator` 3,454; `@pokertools/evaluator` 2,290; `poker-odds-calc` 2,143; `poker-evaluator-ts` 393; `@xpressit` 376; `poker-tools` 133.

---

## The findings that decide it

### 1. The 7462 equivalence classes are a genuinely known-good reference

Every serious evaluator descends from Cactus Kev's observation that the 2,598,960 distinct 5-card hands collapse into exactly **7,462 equivalence classes** under poker ranking. That number, and the per-category hand frequencies, are settled combinatorics rather than any one library's opinion — which makes them an oracle rather than a second opinion.

I enumerated all 2,598,960 five-card hands with `phe` and counted categories:

```
distinct phe strength values: 7462 (expected 7462)
PASS  Straight Flush            40  PASS  Three of a Kind    54912
PASS  Four of a Kind           624  PASS  Two Pair          123552
PASS  Full House              3744  PASS  One Pair         1098240
PASS  Flush                   5108  PASS  High Card        1302540
PASS  Straight               10200
```

Runtime: **0.6 seconds.**

Then all 133,784,560 seven-card hands, against the known 7-card best-five frequencies:

```
total 7-card hands: 133784560 (expected 133784560)
distinct strength values reachable from 7 cards: 4824
PASS  Straight Flush        41584   PASS  Three of a Kind    6461620
PASS  Four of a Kind       224848   PASS  Two Pair          31433400
PASS  Full House          3473184   PASS  One Pair          58627800
PASS  Flush               4047644   PASS  High Card         23294460
PASS  Straight            6180020
```

Runtime: **16.9 seconds.**

This is the single most important result in the ticket. **The entire hold'em showdown space is small enough to enumerate exhaustively in seconds.** "Property-based testing" here does not mean sampling and hoping — it means proving the evaluator correct over every input it can ever see, in less time than a typical unit-test suite takes to start. Given the map ranks engine correctness first, that changes the build-vs-buy calculus completely: the risk normally associated with writing your own evaluator can be driven to zero by a test that runs in CI.

(Incidental finding worth knowing: only **4,824** of the 7,462 classes are reachable from seven cards. The other 2,638 — e.g. a 5-card hand whose best-five would be beaten by a straight or flush also present among the seven — cannot occur at a hold'em showdown. Don't write a test asserting all 7,462 appear.)

### 2. A hand-written evaluator matches the reference exactly, first try

To measure the real cost of the build option I wrote a plain "sort, group, compare" evaluator — no bit tricks, no lookup tables, just `C(7,5) = 21` combinations scored and maxed. About 60 lines of logic. Validated against `phe`:

```
enumerated 2598960 5-card hands
distinct naive score classes: 7462 (phe distinct: 7462)
score classes mapping to >1 phe value: 0
monotonicity violations: 0
7-card showdown disagreements vs phe (20000 trials): 0
```

The score classes are **bijective** with `phe`'s — same 7,462 classes, same induced ordering, no class straddling two `phe` values and no ordering inversion anywhere in the 5-card space. It took one pass to write. The only subtlety that needed care was the wheel (A-2-3-4-5, where the ace plays low and the straight is five-high); everything else falls out of sorting ranks descending and grouping by count.

Total runtime for that whole validation, including the 2.6 M enumeration: **4.9 seconds.**

### 3. `pokersolver` is the only library with good descriptions, and it is the one you cannot trust for display

The map wants the table device to say *why* a hand won. Only `pokersolver` produces that phrasing natively:

```
"Royal Flush"  "Two Pair, A's & K's"  "Flush, Ac High"  "Straight, 5 High"  "Pair, K's"
```

`phe` and `@xpressit` give the category only (`Flush`, `TwoPair`) — the "ace high" part would have to be written by hand regardless.

But `pokersolver` has two disqualifying problems, both confirmed by running it:

**Its `.rank` is not a comparable rank.** It returns the category index 1–9 only. Two different two-pair hands both report `rank: 3`. Ordering must go through `Hand.winners()`, so `rank` cannot be stored as the hand's strength or compared across hands — a trap that would be easy to fall into and would silently mis-award split pots.

**Its `.cards` array — the thing you would render — is sometimes not five cards.** Over 20,000 random two-player showdowns (40,000 solved hands):

```
non-5-card made hands: {"Flush:6": 85, "Full House:6": 12}
```

For example `5c Kc 4c 8c 9d Ac Tc` returns a six-card flush `[Ac, Kc, Tc, 8c, 5c, 4c]`, and `7h 3s 5c 3d 7c 3h 7s` returns `[7h, 7c, 7s, 3s, 3d, 3h]` for a full house. That is roughly **0.24% of hands** — several times a poker night, on the exact feature we would be adopting the library for. This is upstream issue [#31](https://github.com/goldfire/pokersolver/issues/31), open since May 2023.

Its ranking is nonetheless sound: **0 ordering disagreements with `phe` across all 20,000 showdowns.** The bug is in the reported combination, not the comparison.

Maintenance is the third strike. Last functional commit July 2020; the only commit since is a `FUNDING.yml`. Thirteen open issues including several correctness reports ([#11](https://github.com/goldfire/pokersolver/issues/11) four-of-a-kind reported as a full house with wilds, [#23](https://github.com/goldfire/pokersolver/issues/23) royal flush naming, [#32](https://github.com/goldfire/pokersolver/issues/32) wild-card straights). Most involve wild cards or exotic variants that hold'em never hits, but nobody is triaging them. It also ships **no TypeScript types** — no bundled `.d.ts`, and `@types/pokersolver` does not exist on npm ([#30](https://github.com/goldfire/pokersolver/issues/30), open since 2023). Under "TypeScript end to end" we would be hand-writing and maintaining declarations for an unmaintained library.

### 4. `poker-evaluator` is disqualified by the Pi constraint and by engine purity

Both `poker-evaluator` and its TS port ship the Two Plus Two lookup table as `HandRanks.dat` — **129,951,336 bytes**, confirmed via the GitHub contents API. Unpacked package size is ~130 MB against `phe`'s 557 KB.

Worse for us, `lib/PokerEvaluator.js` ends with:

```js
var ranksFile = path.join(__dirname, '../data/HandRanks.dat');
module.exports.ranks = fs.readFileSync(ranksFile);
```

A **synchronous 124 MiB file read at module import**. That is a straight collision with two standing constraints: the engine is supposed to be pure with no I/O, and the thing is meant to run on a Raspberry Pi where a 124 MiB resident buffer is a serious fraction of available RAM. The table buys ~22 M hands/second, which is irrelevant for nine players evaluating nine hands once per hand. Note also that the `poker-evaluator` npm package has no `repository` field and its published date (2025) does not line up with the GitHub repo's last push (2020), so the provenance of the current npm artefact is not something I could verify.

### 5. Ties, splits and the 7-choose-5 case are handled correctly by `phe` and `@xpressit`

Six hand-built edge cases, all three libraries cross-checked:

| Case | Expected | phe | pokersolver | @xpressit |
|---|---|---|---|---|
| Royal flush on the board, 3 players | 3-way split | ✅ | ✅ | ✅ |
| Board plays A-K-Q-J-9, both holes dead | 2-way split | ✅ | ✅ | ✅ |
| Aces & kings, Q vs J kicker | kicker decides | ✅ | ✅ | ✅ |
| Same straight, different suits | 2-way split | ✅ | ✅ | ✅ |
| Wheel A-2-3-4-5 vs pair of kings | wheel wins | ✅ | ✅ | ✅ |
| Six-card flush | flush wins | ✅ | ✅ (6 cards shown) | ✅ |

`phe` and `@xpressit` return **identical numeric values** on every case (1600, 2468, 6186, 412 …). Splits therefore fall out for free: equal value means split, and the engine just groups live players by evaluated value and takes the minimum. Neither library has a "split pot" concept, and neither needs one — which suits Phase 1, where there are no chips to split anyway and a split is purely a display outcome.

That identity is worth being honest about: `phe` derives from HenryRLee's `PokerHandEvaluator` (Apache 2.0, perfect-hash over Cactus Kev), and `@xpressit`'s internals are named `cactusFastRankHand.ts` — it is a rewrite of `cardrank`. **Both descend from Cactus Kev, so their agreement is weaker evidence than two independent implementations would be.** This is exactly why the canonical *frequency tables* matter more than library-vs-library agreement: the frequencies are external to the whole lineage.

Both handle 7-choose-5 internally — you pass seven cards and get the best five's strength; no manual combination generation. `@xpressit` also takes board and hole cards as separate arguments and returns the `madeHand` as a 5-tuple plus `unused`, which is a very good fit for the table display, and its types are genuinely TypeScript-native:

```ts
type PlayingCard = 'AC' | 'AS' | ... ;   // 52-member literal union
type Combination = 'RoyalFlush' | 'StraightFlush' | ... | 'Invalid';
madeHand: [PlayingCard, PlayingCard, PlayingCard, PlayingCard, PlayingCard];
```

Its weakness is bus factor: 3 GitHub stars, 376 downloads/month, one organisation. Fine as a dev dependency, thin to put on the critical path of the one component the map says must not be wrong.

---

## Build-it-yourself: the algorithm options

| Approach | Idea | Code size | Effort | Speed | Verdict |
|---|---|---|---|---|---|
| **Naive combinatorial** | Score each of the 21 five-card subsets, take the max | ~60 lines | hours | ~10⁵–10⁶/s | **Right answer here** |
| **Cactus Kev 5-card** | Prime-product per hand, index a 7,462-entry table | ~100 lines + generated table | days | ~10⁷/s | Table must itself be generated and verified; complexity with no payoff |
| **Two Plus Two** | 32M-entry DAG, seven array lookups, no combination loop | small code, 124 MB table | days | ~10⁸/s | Table is the artefact; ruled out by the Pi |
| **Perfect hash (`phe`'s)** | Hash rank-multiset, flushes handled separately | moderate + tables | days | ~10⁷/s | Same trade as Cactus Kev |
| **Bitmask tricks** | 13-bit rank masks for straights/flushes, popcount | ~80 lines | days | ~10⁶/s | Marginal gain, real subtlety |

Nine players, one showdown per hand, maybe 60 hands a night: about **540 evaluations per session**. The naive approach does that in well under a millisecond. Every other row on this table buys performance this project will never observe, at the cost of a generated lookup table that becomes a second thing needing verification. Performance is not merely a low priority here — optimising is actively harmful, because it trades away the thing that is scarce (auditable simplicity) for a thing that is free (speed).

The naive approach also has a property none of the table-driven ones do: **it knows what the hand is, not just how strong it is.** It has the winning five cards and the grouped ranks in hand at the moment it decides, so `"Flush, ace high"` and `"Two Pair, aces and kings"` are a formatting function over data already computed — not a second lookup or a string parsed back out of a library's output. The one library that gives good descriptions is the one that gets the card list wrong.

---

## Recommendation

**Build the evaluator inside the engine. Use `phe` as a dev-dependency test oracle. Take no runtime dependency.**

The reasoning, in order of weight:

1. **The correctness argument, normally the reason to take a library, points the other way here.** The build risk is fully retired by an exhaustive test, not merely reduced — all 133,784,560 seven-card hands verified against externally-known frequencies in 17 seconds, plus a bijection check against `phe` over the whole 5-card space. A dependency cannot be verified more thoroughly than that, and two of the candidates demonstrably fail on their own terms.

2. **No library gives us what we actually need.** The requirement is a comparable rank *and* the correct five cards *and* a human-readable description. `phe` has the rank only. `@xpressit` has rank and cards but only category names. `pokersolver` has the descriptions but a category-only rank and a real, open, reproducible bug in the card list — 0.24% of hands — on precisely the display feature we would adopt it for. Building means writing the description layer regardless; building the whole thing costs marginally more than building the description layer over `@xpressit`.

3. **The engine must be pure.** A self-contained evaluator is trivially pure. `poker-evaluator` reads 124 MiB from disk at import, and any dependency is a standing risk of I/O, ambient state or lazy initialisation appearing in a minor version, inside the component the map most wants to keep deterministic and replayable.

4. **It is genuinely small.** ~60 lines of logic, one subtle case (the wheel), one afternoon including tests. That is smaller than the wrapper, adapter types and hand-written `.d.ts` that `pokersolver` would need.

5. **Raspberry Pi and TypeScript-end-to-end both favour zero dependencies.** Nothing to compile, nothing architecture-specific, no untyped surface to shim.

### Suggested test strategy for [#15](https://github.com/ewanhardingham/table-top-pocker/issues/15)

- **Exhaustive 5-card**: enumerate all 2,598,960, assert exactly 7,462 distinct classes and the nine canonical category frequencies. ~1 s.
- **Exhaustive 7-card**: enumerate all 133,784,560, assert the nine canonical 7-card frequencies and that exactly 4,824 classes are reachable. ~20–60 s — CI-nightly rather than per-commit if it drags.
- **Differential against `phe`**: assert the bijection between our score classes and `phe`'s values over the full 5-card space, and zero ordering disagreements over random 7-card showdowns. This is the strongest single test and it runs in ~5 s.
- **Ordering invariants** (property-based, e.g. `fast-check`): comparison is a total preorder — antisymmetric, transitive; suit permutation never changes a hand's value; adding a card never weakens the best-five.
- **Named edge cases** (unit): wheel; steel wheel (A-2-3-4-5 suited); six-card flush returns five cards; board-plays split; counterfeited kicker; quads on the board with the kicker deciding; two players with the same trips, different kickers.
- **Keep `phe` a `devDependency`.** It never ships to the Pi, so its 2018 dormancy is irrelevant — a frozen oracle is arguably a feature.

### What I could not verify

- `@pokertools/evaluator` and `poker-tools` were surveyed from registry metadata only, not installed and exercised. `@pokertools/evaluator` is the most actively maintained candidate (last commit 2026-07-03) and would be worth a look if the recommendation is rejected; note its repo is a monorepo whose recent commits are about tournament escrow and API concerns rather than the evaluator, so activity there is not evidence the evaluator is being maintained.
- The `poker-evaluator` npm artefact's provenance — the package declares no `repository`, and its publish dates do not match the GitHub repo's activity.
- I did not benchmark on actual Raspberry Pi hardware; the Pi argument rests on the 124 MiB resident-buffer figure and the absence of native code, both of which are verified facts, not on measured Pi performance.
- The `pokersolver` non-five-card rate (0.24%) is measured over 20,000 random showdowns, not derived analytically; the true rate is close to but not exactly that.

---

## Method

```
node 22.22.1
npm install pokersolver phe @xpressit/winning-poker-hand-rank
```

Registry metadata via `https://registry.npmjs.org/<pkg>` and `https://api.npmjs.org/downloads/point/last-month/<pkg>`; repository metadata, commit history, issue lists and file sizes via the GitHub REST API; licences read from the `LICENSE` files in the installed packages. Scripts written for this ticket: exhaustive 5-card enumeration, exhaustive 7-card enumeration, 20,000-showdown differential test, six-case tie/split matrix, and a from-scratch naive evaluator validated against `phe`. Canonical 5-card and 7-card category frequencies are standard combinatorial results, used here as the external oracle and independently corroborated by the enumeration matching them exactly.
