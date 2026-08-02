/**
 * The Hole-card module's seam (Phase 3 spec #138 §1). It exports **two**
 * names and nothing else: the component, and the Action port the module
 * defines for itself.
 *
 * Everything else — the reducer, the hook, the view adapter, the bendable
 * card, the constants — is module-internal and imported by nothing outside
 * this directory. That is what keeps pointers, bends and recognizer states
 * out of `Hand`, and what lets every later gesture be an addition inside
 * `holecards/` rather than surgery on the component tree.
 */
export { HoleCardPair } from "./HoleCardPair.js";
export type { CardActions } from "./ports.js";
