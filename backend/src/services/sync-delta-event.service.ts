/**
 * @fileoverview Sync Delta Event Service
 * @module @nxt1/backend/services/sync-delta-event
 *
 * Persists recent deterministic sync diffs into MongoDB with TTL retention
 * and mirrors a lightweight completion event into the analytics event stream.
 */

import type { SyncDeltaReport } from '@nxt1/core';
import {
  SyncDeltaEventModel,
  type SyncDeltaEventDocument,
} from '../models/sync-delta-event.model.js';
import { getRuntimeEnvironment } from '../config/runtime-environment.js';
import { getAnalyticsLoggerService } from './analytics-logger.service.js';
import { logger } from '../utils/logger.js';

const DEFAULT_RECENT_LIMIT = 4;

export class SyncDeltaEventService {
  async record(delta: SyncDeltaReport): Promise<{ eventId: string; promptSummary: string }> {
    const syncedAt = new Date(delta.syncedAt);
    const environment = getRuntimeEnvironment();
    const promptSummary = this.buildPromptSummary(delta);

    const document: SyncDeltaEventDocument = {
      environment,
      userId: delta.userId,
      teamId: delta.teamId ?? null,
      organizationId: delta.organizationId ?? null,
      sport: delta.sport,
      source: delta.source,
      syncedAt,
      promptSummary,
      summary: delta.summary,
      deltaReport: delta,
      meta: {
        environment,
        userId: delta.userId,
        sport: delta.sport,
        source: delta.source,
        teamId: delta.teamId ?? null,
        organizationId: delta.organizationId ?? null,
      },
    };

    const created = await SyncDeltaEventModel.create(document);

    void getAnalyticsLoggerService().safeTrack({
      subjectId: delta.userId,
      subjectType: 'user',
      domain: 'system',
      eventType: 'sync_completed',
      occurredAt: syncedAt,
      source: 'system',
      value: delta.summary.totalChanges,
      tags: this.buildTags(delta),
      payload: {
        sport: delta.sport,
        source: delta.source,
        promptSummary,
        summary: delta.summary,
      },
      metadata: {
        environment,
        teamId: delta.teamId ?? null,
        organizationId: delta.organizationId ?? null,
      },
    });

    return {
      eventId: String(created._id),
      promptSummary,
    } as const;
  }

  async listRecentSummaries(input: {
    userId: string;
    teamId?: string;
    organizationId?: string;
    limit?: number;
  }): Promise<readonly string[]> {
    const limit = Math.min(Math.max(input.limit ?? DEFAULT_RECENT_LIMIT, 1), 10);
    const environment = getRuntimeEnvironment();
    const filters: Array<Record<string, string>> = [{ userId: input.userId }];

    if (typeof input.teamId === 'string' && input.teamId.trim().length > 0) {
      filters.push({ teamId: input.teamId.trim() });
    }
    if (typeof input.organizationId === 'string' && input.organizationId.trim().length > 0) {
      filters.push({ organizationId: input.organizationId.trim() });
    }

    const query =
      filters.length === 1 ? { environment, ...filters[0] } : { environment, $or: filters };

    const rows = await SyncDeltaEventModel.find(query)
      .sort({ syncedAt: -1 })
      .limit(limit)
      .select('promptSummary')
      .lean()
      .exec();

    return rows
      .map((row) => (typeof row.promptSummary === 'string' ? row.promptSummary.trim() : ''))
      .filter((row) => row.length > 0);
  }

  private buildPromptSummary(delta: SyncDeltaReport): string {
    const summaryBits: string[] = [];

    if (delta.summary.identityFieldsChanged > 0) {
      summaryBits.push(
        `${delta.summary.identityFieldsChanged} profile update${delta.summary.identityFieldsChanged === 1 ? '' : 's'}`
      );
    }
    if (delta.summary.statsUpdated > 0) {
      summaryBits.push(
        `${delta.summary.statsUpdated} stat change${delta.summary.statsUpdated === 1 ? '' : 's'}`
      );
    }
    if (delta.summary.newRecruitingActivities > 0) {
      summaryBits.push(
        `${delta.summary.newRecruitingActivities} recruiting update${delta.summary.newRecruitingActivities === 1 ? '' : 's'}`
      );
    }
    if (delta.summary.newAwards > 0) {
      summaryBits.push(
        `${delta.summary.newAwards} new award${delta.summary.newAwards === 1 ? '' : 's'}`
      );
    }
    if (delta.summary.newScheduleEvents > 0) {
      summaryBits.push(
        `${delta.summary.newScheduleEvents} schedule addition${delta.summary.newScheduleEvents === 1 ? '' : 's'}`
      );
    }
    if (delta.summary.newVideos > 0) {
      summaryBits.push(
        `${delta.summary.newVideos} new video${delta.summary.newVideos === 1 ? '' : 's'}`
      );
    }
    if (delta.summary.newCategoriesAdded > 0) {
      summaryBits.push(
        `${delta.summary.newCategoriesAdded} new stat categor${delta.summary.newCategoriesAdded === 1 ? 'y' : 'ies'}`
      );
    }

    const headline = summaryBits.length > 0 ? summaryBits.join(', ') : 'no material changes';
    const highlights = this.extractHighlights(delta);

    return highlights.length > 0
      ? `${delta.sport} sync via ${delta.source}: ${headline}. Highlights: ${highlights.join('; ')}`
      : `${delta.sport} sync via ${delta.source}: ${headline}.`;
  }

  private extractHighlights(delta: SyncDeltaReport): string[] {
    const highlights: string[] = [];

    for (const change of delta.identityChanges.slice(0, 2)) {
      highlights.push(`${change.field} → ${this.toInlineValue(change.newValue)}`);
    }

    for (const change of delta.statChanges.slice(0, Math.max(0, 3 - highlights.length))) {
      highlights.push(`${change.label}: ${this.toInlineValue(change.newValue)}`);
    }

    if (!highlights.length && delta.newAwards[0]) {
      const title = this.toInlineValue(delta.newAwards[0]['title'] ?? delta.newAwards[0]['name']);
      if (title) highlights.push(`award added: ${title}`);
    }

    if (!highlights.length && delta.newScheduleEvents[0]) {
      const event = delta.newScheduleEvents[0];
      highlights.push(`schedule added: ${event.opponent ?? event.date}`);
    }

    if (!highlights.length && delta.newVideos[0]) {
      highlights.push(`video added from ${delta.newVideos[0].provider}`);
    }

    return highlights;
  }

  private buildTags(delta: SyncDeltaReport): string[] {
    return ['sync', this.normalizeTag(delta.sport), this.normalizeTag(delta.source)].filter(
      (tag): tag is string => tag.length > 0
    );
  }

  private normalizeTag(value: string): string {
    return value
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-');
  }

  private toInlineValue(value: unknown): string {
    if (typeof value === 'string') return value.trim().slice(0, 80);
    if (typeof value === 'number' || typeof value === 'boolean') return String(value);
    if (value === null || value === undefined) return '';
    try {
      return JSON.stringify(value).slice(0, 80);
    } catch {
      logger.debug('[SyncDeltaEventService] Failed to stringify highlight value');
      return '';
    }
  }
}

let syncDeltaEventService: SyncDeltaEventService | null = null;

export function getSyncDeltaEventService(): SyncDeltaEventService {
  syncDeltaEventService ??= new SyncDeltaEventService();
  return syncDeltaEventService;
}
