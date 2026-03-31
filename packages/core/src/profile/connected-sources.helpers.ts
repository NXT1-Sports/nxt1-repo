/**
 * @fileoverview Connected Sources Helpers
 * @module @nxt1/core/profile
 *
 * Pure helper functions for mapping and deduplicating connected sources.
 * Used by the add-sport wizard (web + mobile) and profile editing flows.
 *
 * 100% portable — NO platform dependencies.
 */

import type { ConnectedSource } from '../models/user/user-base.model';

/**
 * A connected link source entry from the onboarding / add-sport form.
 * This is a subset of the full `LinkSourceEntry` from `@nxt1/core/api`
 * (re-declared here to avoid a circular dependency with the onboarding module).
 */
interface LinkSourceLike {
  readonly platform: string;
  readonly connected: boolean;
  readonly url?: string;
  readonly scopeType?: 'global' | 'sport' | 'team';
  readonly scopeId?: string;
}

/**
 * Maps connected link-source form entries to the `ConnectedSource` model
 * expected by the profile update endpoint.
 *
 * Only entries that are flagged as connected AND have a non-empty URL are kept.
 */
export function mapToConnectedSources(entries: readonly LinkSourceLike[]): ConnectedSource[] {
  return entries
    .filter((e) => e.connected && e.url?.trim())
    .map((e) => ({
      platform: e.platform,
      profileUrl: e.url ?? '',
      scopeType: e.scopeType,
      scopeId: e.scopeId,
    }));
}

/**
 * Stable deduplication key for a ConnectedSource.
 * Two sources with the same key represent the same logical connection.
 */
export function connectedSourceKey(s: ConnectedSource): string {
  return `${s.platform}|${s.scopeType ?? 'global'}|${s.scopeId ?? ''}`;
}

/**
 * Merges new connected sources into an existing set, deduplicating by
 * platform + scope. New sources overwrite existing ones with the same key.
 */
export function mergeConnectedSources(
  existing: readonly ConnectedSource[],
  incoming: readonly ConnectedSource[]
): ConnectedSource[] {
  const map = new Map<string, ConnectedSource>();
  for (const s of existing) map.set(connectedSourceKey(s), s);
  for (const s of incoming) map.set(connectedSourceKey(s), s);
  return Array.from(map.values());
}
