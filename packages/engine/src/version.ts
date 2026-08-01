/**
 * Schema version tag for persisted command/event log records — bumped
 * whenever a change to `HandEvent`/`Command` shapes or the shuffle would
 * break bit-identical replay. See docs/phase-1-spec.md §5.
 */
export const ENGINE_LOG_VERSION = 2;
