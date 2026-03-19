/**
 * @fileoverview Operations Log Helper Functions
 * @module @nxt1/backend/routes/operations-log-helpers
 *
 * Pure helper functions for the GET /operations-log endpoint.
 * Extracted for testability — no side effects, no framework dependencies.
 */

import type { AgentJobOrigin, OperationLogStatus, OperationLogCategory } from '@nxt1/core';

// ─── Job Origin Validation ──────────────────────────────────────────────────

/**
 * Set of all valid {@link AgentJobOrigin} values for runtime validation.
 * Used by {@link validateJobOrigin} to coerce raw Firestore strings.
 */
const VALID_JOB_ORIGINS: ReadonlySet<AgentJobOrigin> = new Set([
  'user',
  'system_cron',
  'database_event',
  'webhook',
  'agent_chain',
]);

/**
 * Validates and coerces a raw Firestore string to a typed {@link AgentJobOrigin}.
 *
 * Protects against stale or invalid data written to Firestore before the enum
 * was fully enforced. Returns `'user'` as a safe default for unrecognised values.
 *
 * @param value - Raw value from Firestore document (`unknown` to handle any shape)
 * @returns A valid {@link AgentJobOrigin}, defaulting to `'user'`
 *
 * @example
 * ```ts
 * validateJobOrigin('system_cron'); // → 'system_cron'
 * validateJobOrigin('invalid');     // → 'user'
 * validateJobOrigin(undefined);     // → 'user'
 * validateJobOrigin(42);            // → 'user'
 * ```
 */
export function validateJobOrigin(value: unknown): AgentJobOrigin {
  if (typeof value === 'string' && VALID_JOB_ORIGINS.has(value as AgentJobOrigin)) {
    return value as AgentJobOrigin;
  }
  return 'user';
}

// ─── Status Mapping ─────────────────────────────────────────────────────────

/**
 * Maps Firestore {@link AgentOperationStatus} to the display-friendly
 * {@link OperationLogStatus} consumed by the frontend bottom sheet.
 *
 * Known statuses:
 * - `'completed'` → `'complete'`
 * - `'failed'` → `'error'`
 * - `'cancelled'` → `'cancelled'`
 * - `'pending'`, `'queued'`, `'processing'`, `'thinking'`, `'acting'` → `'in-progress'`
 *
 * Any other unrecognised status is treated as `'in-progress'` so the UI shows
 * a spinner while the job is active. The optional `onUnknown` callback is
 * invoked for unrecognised values to enable logging without coupling to a logger.
 *
 * @param status    - Raw status string from Firestore
 * @param onUnknown - Optional callback invoked with the raw string when it's not a known status
 * @returns Display-friendly {@link OperationLogStatus}
 */
export function mapJobStatus(
  status: string,
  onUnknown?: (raw: string) => void
): OperationLogStatus {
  switch (status) {
    case 'completed':
      return 'complete';
    case 'failed':
      return 'error';
    case 'cancelled':
      return 'cancelled';
    case 'pending':
    case 'queued':
    case 'processing':
    case 'thinking':
    case 'acting':
      return 'in-progress';
    default:
      onUnknown?.(status);
      return 'in-progress';
  }
}

// ─── Category Inference ─────────────────────────────────────────────────────

/**
 * Keyword-to-category mapping used by {@link inferCategory}.
 * Order matters — first match wins.
 */
const CATEGORY_KEYWORDS: ReadonlyArray<{
  readonly category: OperationLogCategory;
  readonly keywords: readonly string[];
}> = [
  { category: 'outreach', keywords: ['email', 'outreach', 'coach', 'send'] },
  { category: 'content', keywords: ['highlight', 'graphic', 'video', 'reel', 'post', 'brand'] },
  { category: 'film', keywords: ['film', 'game', 'footage', 'play'] },
  { category: 'recruiting', keywords: ['recruit', 'camp', 'ncaa', 'transfer', 'prospect'] },
  { category: 'analytics', keywords: ['stat', 'analytics', 'report', 'scout', 'compare'] },
  { category: 'profile', keywords: ['profile', 'bio', 'photo', 'gpa', 'academic'] },
];

/**
 * Infers the best-fit {@link OperationLogCategory} from a job intent string
 * using keyword matching. Matching is case-insensitive and first-match wins.
 *
 * @param intent - The user's natural-language intent string
 * @returns The inferred category, or `'system'` if no keywords match
 *
 * @example
 * ```ts
 * inferCategory('Send my stats to coaches');  // → 'outreach'
 * inferCategory('Generate highlight reel');   // → 'content'
 * inferCategory('Run daily sync');            // → 'system'
 * ```
 */
export function inferCategory(intent: string): OperationLogCategory {
  const lower = intent.toLowerCase();
  for (const { category, keywords } of CATEGORY_KEYWORDS) {
    if (keywords.some((kw) => lower.includes(kw))) return category;
  }
  return 'system';
}

// ─── Category Icons ─────────────────────────────────────────────────────────

/**
 * Exhaustive icon lookup for all {@link OperationLogCategory} values.
 * Adding a new category without an icon entry will cause a TS compile error.
 */
const CATEGORY_ICONS: Readonly<Record<OperationLogCategory, string>> = {
  outreach: 'mail',
  content: 'sparkles',
  film: 'videocam',
  recruiting: 'school',
  analytics: 'barChart',
  profile: 'person',
  system: 'settings',
};

/**
 * Returns the icon name for an {@link OperationLogCategory}.
 *
 * @param category - A valid operation log category
 * @returns The icon identifier string used by `nxt1-icon`
 */
export function iconForCategory(category: OperationLogCategory): string {
  return CATEGORY_ICONS[category];
}

// ─── Duration Computation ───────────────────────────────────────────────────

/** Minimal interface matching Firestore `Timestamp.toMillis()`. */
export interface TimestampLike {
  toMillis(): number;
}

/**
 * Computes a human-readable duration string between two timestamps.
 *
 * Handles edge cases:
 * - Missing timestamps → `undefined`
 * - Malformed timestamp objects (no `toMillis` method) → `undefined`
 * - Non-finite millisecond values → `undefined`
 * - Zero or negative diff → `'0m 00s'`
 *
 * @param createdAt   - Operation start timestamp
 * @param completedAt - Operation end timestamp; `null`/`undefined` = still running
 * @returns `"Xm YYs"` string, or `undefined` if timestamps are absent or invalid
 *
 * @example
 * ```ts
 * computeDuration(ts(1000), ts(135000));  // → '2m 14s'
 * computeDuration(ts(1000), ts(1000));    // → '0m 00s'
 * computeDuration(undefined, ts(1000));   // → undefined
 * ```
 */
export function computeDuration(
  createdAt: TimestampLike | undefined,
  completedAt: TimestampLike | undefined | null
): string | undefined {
  if (!createdAt || !completedAt) return undefined;
  if (typeof createdAt.toMillis !== 'function' || typeof completedAt.toMillis !== 'function') {
    return undefined;
  }
  const startMs = createdAt.toMillis();
  const endMs = completedAt.toMillis();
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) return undefined;
  const diffMs = endMs - startMs;
  if (diffMs <= 0) return '0m 00s';
  const totalSeconds = Math.floor(diffMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}m ${String(seconds).padStart(2, '0')}s`;
}
