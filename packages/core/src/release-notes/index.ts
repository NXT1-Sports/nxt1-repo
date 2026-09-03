/**
 * @fileoverview @nxt1/core/release-notes - Public API
 * @module @nxt1/core/release-notes
 */

/**
 * Temporary rollout switch for user-facing release-note prompts.
 * Flip back to true when the What's New modal is ready for production users.
 */
export const RELEASE_NOTES_PROMPT_ENABLED = false;

export * from './release-notes.types';
export * from './release-notes.api';
