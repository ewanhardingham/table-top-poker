/**
 * Compatibility version tag for persisted command/event log records — bumped
 * whenever command or event shapes, the shuffle, or engine behaviour would
 * break bit-identical replay. See Phase 1 spec #130 §5.
 */
export const ENGINE_LOG_VERSION = 4;
