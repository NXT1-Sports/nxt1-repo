/**
 * @fileoverview Profile routes — shim for backward compatibility.
 *
 * The implementation has been split into routes/profile/:
 *   - lookup.routes.ts   — GET /me, /unicode/:unicode, /related, /search, /:userId
 *   - sub-feeds.routes.ts — GET /:userId/timeline, stats, game-logs, metrics, etc.
 *   - mutations.routes.ts  — PUT/POST/DELETE /:userId
 *   - intel.routes.ts     — /:userId/intel
 *
 * This shim re-exports `invalidateProfileCaches` so existing callers
 * (auth routes, agent tools, upload, settings, webhooks) continue to work
 * without any import changes.
 */

export { invalidateProfileCaches } from './shared.js';
export { default } from './index.js';
