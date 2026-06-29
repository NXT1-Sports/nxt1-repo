/**
 * @fileoverview Connected Source Sync Tracker (Job-Scoped)
 * @module @nxt1/backend/modules/agent/services
 *
 * Tracks which connectedSource entries are in scope for an agent job.
 * Worker lifecycle hooks call `markPending()` at execution start and `flush()`
 * on terminal outcomes (`success` | `error`) via Firestore transactions.
 *
 * This decouples "source was scraped" from "job actually finished successfully"
 * — the status reflects the full pipeline result, not just the first tool
 * that happened to write the entry.
 *
 * Lifecycle:
 *  - `track(operationId, entry)` — explicit registration by tool flows.
 *  - `trackFromContext(operationId, context)` — hydrate targets from enqueue context.
 *  - `markPending(operationId)` — stamp all tracked entries as pending at run start.
 *  - `flush(operationId, outcome)` — stamp all tracked entries on terminal state.
 *  - `discard(operationId)` — removes entries without any Firestore write
 *    (used on abort / yield so we don't leave dangling pending entries
 *    indefinitely — the next run will re-register and flush properly).
 *
 * Thread-safety: Node.js is single-threaded; the in-memory Map is safe for
 * concurrent-ish access within one process. For multi-process deployments
 * promote this to Redis (same pattern as OperationMemoryService).
 */

import { getFirestore } from 'firebase-admin/firestore';
import { normalizeConnectedPlatform, normalizeConnectedProfileUrl } from '@nxt1/core/profile';
import { logger } from '../../../utils/logger.js';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface TrackedConnectedSource {
  /** 'user' → Users/{docId}, 'team' → Teams/{docId} */
  readonly docType: 'user' | 'team';
  /** Firestore document ID (userId or teamId) */
  readonly docId: string;
  /** Canonical platform slug (already normalized, e.g. 'x', 'maxpreps') */
  readonly platform: string;
  /** Original profile URL as stored in the connectedSource row */
  readonly profileUrl: string;
  /** Scope kind stored on the row */
  readonly scopeType?: 'global' | 'sport' | 'team';
  /** scopeId stored on the row (e.g. sport key like 'football') */
  readonly scopeId: string;
  /** Display name of the actor who initiated this source registration/resync */
  readonly addedBy?: string;
  /** Firebase UID of the actor who initiated this source registration/resync */
  readonly addedById?: string;
}

interface ConnectedSourceTargetContext {
  readonly docType?: unknown;
  readonly docId?: unknown;
  readonly platform?: unknown;
  readonly profileUrl?: unknown;
  readonly scopeType?: unknown;
  readonly scopeId?: unknown;
  readonly addedBy?: unknown;
  readonly addedById?: unknown;
}

function normalizeScopeId(value: string): string {
  return value.trim().toLowerCase();
}

function hasNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function findMatchingConnectedSourceIndexes(
  sources: readonly Record<string, unknown>[],
  entry: TrackedConnectedSource
): number[] {
  const normalizedUrl = normalizeConnectedProfileUrl(entry.profileUrl);
  const normalizedScope = normalizeScopeId(entry.scopeId);
  const matches: number[] = [];

  for (let index = 0; index < sources.length; index += 1) {
    const cs = sources[index] ?? {};
    const csPlatform =
      typeof cs['platform'] === 'string' ? normalizeConnectedPlatform(cs['platform']) : '';
    const csScopeType =
      cs['scopeType'] === 'global' || cs['scopeType'] === 'sport' || cs['scopeType'] === 'team'
        ? (cs['scopeType'] as 'global' | 'sport' | 'team')
        : undefined;
    const csScope = typeof cs['scopeId'] === 'string' ? normalizeScopeId(cs['scopeId']) : '';
    const csUrl =
      typeof cs['profileUrl'] === 'string' ? normalizeConnectedProfileUrl(cs['profileUrl']) : '';

    const samePlatform = csPlatform === entry.platform;
    const sameScopeType = entry.scopeType !== undefined && csScopeType === entry.scopeType;
    const sameScope = csScope !== '' && csScope === normalizedScope;
    const sameUrl = csUrl !== '' && csUrl === normalizedUrl;

    const matchesScopedEntry = entry.scopeType
      ? sameScopeType && (entry.scopeType === 'global' || sameScope)
      : sameScope;

    if (samePlatform && (sameUrl || matchesScopedEntry)) {
      matches.push(index);
    }
  }

  return matches;
}

function toTrackedConnectedSource(value: unknown): TrackedConnectedSource | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as ConnectedSourceTargetContext;

  const docType = raw.docType === 'team' ? 'team' : raw.docType === 'user' ? 'user' : null;
  const docId = typeof raw.docId === 'string' ? raw.docId.trim() : '';
  const platform = typeof raw.platform === 'string' ? normalizeConnectedPlatform(raw.platform) : '';
  const profileUrl = typeof raw.profileUrl === 'string' ? raw.profileUrl.trim() : '';
  const scopeType =
    raw.scopeType === 'global' || raw.scopeType === 'sport' || raw.scopeType === 'team'
      ? (raw.scopeType as 'global' | 'sport' | 'team')
      : undefined;
  const scopeId = typeof raw.scopeId === 'string' ? normalizeScopeId(raw.scopeId) : '';

  if (!docType || !docId || !platform || !profileUrl) return null;

  return {
    docType,
    docId,
    platform,
    profileUrl,
    ...(scopeType ? { scopeType } : {}),
    scopeId,
    ...(hasNonEmptyString(raw.addedBy) ? { addedBy: raw.addedBy.trim() } : {}),
    ...(hasNonEmptyString(raw.addedById) ? { addedById: raw.addedById.trim() } : {}),
  };
}

// ─── Singleton store ─────────────────────────────────────────────────────────

const store = new Map<string, TrackedConnectedSource[]>();

function trackedEntryKey(entry: TrackedConnectedSource): string {
  return `${entry.docType}:${entry.docId}:${entry.platform}:${entry.scopeType ?? ''}:${normalizeConnectedProfileUrl(entry.profileUrl)}`;
}

// ─── Service ─────────────────────────────────────────────────────────────────

export function getConnectedSourceSyncTracker() {
  const trackOne = (operationId: string, entry: TrackedConnectedSource): number => {
    const existing = store.get(operationId) ?? [];
    const key = trackedEntryKey(entry);
    const prior = existing.find((candidate) => trackedEntryKey(candidate) === key);
    const deduped = existing.filter((candidate) => trackedEntryKey(candidate) !== key);
    deduped.push({
      ...prior,
      ...entry,
      scopeId: normalizeScopeId(entry.scopeId || prior?.scopeId || ''),
      ...(!entry.addedBy && prior?.addedBy ? { addedBy: prior.addedBy } : {}),
      ...(!entry.addedById && prior?.addedById ? { addedById: prior.addedById } : {}),
    });
    store.set(operationId, deduped);
    return deduped.length;
  };

  return {
    /**
     * Register a connected source entry for this operation. Called by
     * scrape_and_index_profile (primary) and write_core_identity (fallback).
     * Deduplicates by docType+docId+platform+profileUrl so double-registration
     * from both callers is safe.
     */
    track(operationId: string, entry: TrackedConnectedSource): void {
      const trackedCount = trackOne(operationId, entry);

      logger.debug('[ConnectedSourceSyncTracker] Tracked pending source', {
        operationId,
        docType: entry.docType,
        docId: entry.docId,
        platform: entry.platform,
        trackedCount,
      });
    },

    /**
     * Registers connected source targets from job context.
     * Expected shape: context.connectedSourceTargets = Array<...>
     */
    trackFromContext(operationId: string, context: unknown): number {
      if (!context || typeof context !== 'object') return 0;
      const targets = (context as Record<string, unknown>)['connectedSourceTargets'];
      if (!Array.isArray(targets) || targets.length === 0) return 0;

      let registered = 0;
      for (const target of targets) {
        const tracked = toTrackedConnectedSource(target);
        if (!tracked) continue;
        trackOne(operationId, tracked);
        registered += 1;
      }

      if (registered > 0) {
        logger.info('[ConnectedSourceSyncTracker] Registered targets from context', {
          operationId,
          registered,
        });
      }
      return registered;
    },

    /**
     * Mark every tracked connected source as pending at operation start.
     */
    async markPending(operationId: string): Promise<void> {
      const entries = store.get(operationId);
      if (!entries?.length) return;

      const db = getFirestore();
      const now = new Date().toISOString();

      logger.info('[ConnectedSourceSyncTracker] Marking tracked sources pending', {
        operationId,
        count: entries.length,
      });

      const results = await Promise.allSettled(
        entries.map(async (entry) => {
          const collectionName = entry.docType === 'user' ? 'Users' : 'Teams';
          const docRef = db.collection(collectionName).doc(entry.docId);

          await db.runTransaction(async (tx) => {
            const snap = await tx.get(docRef);
            if (!snap.exists) return;

            const data = snap.data() ?? {};
            const sources = (data['connectedSources'] ?? []) as Record<string, unknown>[];
            const matchIndexes = findMatchingConnectedSourceIndexes(sources, entry);

            const updated = [...sources];

            if (matchIndexes.length > 0) {
              for (const idx of matchIndexes) {
                updated[idx] = {
                  ...updated[idx],
                  syncStatus: 'pending',
                  connected: false,
                  lastSyncedAt: now,
                  ...(!hasNonEmptyString(updated[idx]['addedBy']) && entry.addedBy
                    ? { addedBy: entry.addedBy }
                    : {}),
                  ...(!hasNonEmptyString(updated[idx]['addedById']) && entry.addedById
                    ? { addedById: entry.addedById }
                    : {}),
                };
              }
            } else {
              // Entry doesn't exist — CREATE it
              updated.push({
                platform: entry.platform,
                profileUrl: entry.profileUrl,
                ...(entry.scopeType ? { scopeType: entry.scopeType } : {}),
                scopeId: entry.scopeId,
                syncStatus: 'pending',
                connected: false,
                lastSyncedAt: now,
                connectionType: 'link',
                ...(entry.addedBy ? { addedBy: entry.addedBy } : {}),
                ...(entry.addedById ? { addedById: entry.addedById } : {}),
              });
            }

            tx.update(docRef, { connectedSources: updated });
          });
        })
      );

      const failures = results.filter((r) => r.status === 'rejected');
      if (failures.length > 0) {
        logger.error('[ConnectedSourceSyncTracker] Some pending writes failed', {
          operationId,
          failureCount: failures.length,
          totalCount: entries.length,
        });
      }
    },

    /**
     * Stamp every tracked connected source for this operation with the final
     * job outcome. Called fire-and-forget from AgentRouterFinalizationService.
     *
     * Uses Firestore transactions so reads and writes are atomic — no partial
     * overwrites even if two workers race on the same document.
     */
    async flush(operationId: string, outcome: 'success' | 'error'): Promise<void> {
      const entries = store.get(operationId);
      store.delete(operationId);

      if (!entries?.length) return;

      const db = getFirestore();
      const now = new Date().toISOString();

      logger.info('[ConnectedSourceSyncTracker] Flushing sync status', {
        operationId,
        outcome,
        count: entries.length,
      });

      const results = await Promise.allSettled(
        entries.map(async (entry) => {
          const collectionName = entry.docType === 'user' ? 'Users' : 'Teams';
          const docRef = db.collection(collectionName).doc(entry.docId);

          await db.runTransaction(async (tx) => {
            const snap = await tx.get(docRef);
            if (!snap.exists) {
              logger.warn('[ConnectedSourceSyncTracker] Document not found during flush', {
                operationId,
                docType: entry.docType,
                docId: entry.docId,
                platform: entry.platform,
              });
              return;
            }

            const data = snap.data() ?? {};
            const sources = (data['connectedSources'] ?? []) as Record<string, unknown>[];
            const matchIndexes = findMatchingConnectedSourceIndexes(sources, entry);

            const updated = [...sources];
            const isSuccess = outcome === 'success';

            if (matchIndexes.length === 0) {
              // Entry missing from doc — UPSERT it so the terminal status is
              // always reflected. This happens when a tool registered a target
              // via `track()` AFTER worker startup (so markPending didn't seed
              // the row) but the doc itself exists.
              logger.info('[ConnectedSourceSyncTracker] Upserting missing entry during flush', {
                operationId,
                outcome,
                docType: entry.docType,
                docId: entry.docId,
                platform: entry.platform,
                scopeId: entry.scopeId,
              });
              updated.push({
                platform: entry.platform,
                profileUrl: entry.profileUrl,
                ...(entry.scopeType ? { scopeType: entry.scopeType } : {}),
                scopeId: entry.scopeId,
                syncStatus: outcome,
                connected: isSuccess,
                lastSyncedAt: now,
                connectionType: 'link',
                ...(entry.addedBy ? { addedBy: entry.addedBy } : {}),
                ...(entry.addedById ? { addedById: entry.addedById } : {}),
              });
            } else {
              for (const idx of matchIndexes) {
                updated[idx] = {
                  ...updated[idx],
                  syncStatus: outcome,
                  connected: isSuccess, // UI reads this boolean for display
                  lastSyncedAt: now,
                  ...(!hasNonEmptyString(updated[idx]['addedBy']) && entry.addedBy
                    ? { addedBy: entry.addedBy }
                    : {}),
                  ...(!hasNonEmptyString(updated[idx]['addedById']) && entry.addedById
                    ? { addedById: entry.addedById }
                    : {}),
                };
              }
            }

            tx.update(docRef, { connectedSources: updated });

            logger.debug('[ConnectedSourceSyncTracker] Flushed entry', {
              operationId,
              outcome,
              platform: entry.platform,
              docType: entry.docType,
              docId: entry.docId,
              syncStatus: outcome,
              connected: isSuccess,
              upserted: matchIndexes.length === 0,
              matchCount: matchIndexes.length,
            });
          });
        })
      );

      const failures = results.filter((r) => r.status === 'rejected');
      if (failures.length > 0) {
        logger.error('[ConnectedSourceSyncTracker] Some flush writes failed', {
          operationId,
          outcome,
          failureCount: failures.length,
          totalCount: entries.length,
          errors: failures.map((r) =>
            r.status === 'rejected'
              ? r.reason instanceof Error
                ? r.reason.message
                : String(r.reason)
              : ''
          ),
        });
      } else {
        logger.info('[ConnectedSourceSyncTracker] All entries flushed successfully', {
          operationId,
          outcome,
          count: entries.length,
          platforms: entries.map((e) => e.platform),
        });
      }
    },

    /**
     * Remove tracked entries without writing. Called on operation abort/yield
     * so stale pending entries don't accumulate.
     */
    discard(operationId: string): void {
      store.delete(operationId);
    },
  };
}
