/**
 * Schema version tag for persisted command/event log records — bumped
 * whenever a change to `HandEvent`/`Command` shapes or the shuffle would
 * break bit-identical replay. See Phase 1 spec #130 §5.
 */
export const ENGINE_LOG_VERSION = 2;
