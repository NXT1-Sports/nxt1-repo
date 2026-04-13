/**
 * @fileoverview Sync Memory Extractor — Deterministic Delta-to-Memory Pipeline
 * @module @nxt1/backend/modules/agent/memory
 */

import type {
  AgentMemoryCategory,
  AgentMemoryTarget,
  AgentUserContext,
  SyncDeltaReport,
} from '@nxt1/core';
import { AgentMemoryModel } from './vector.service.js';
import type { VectorMemoryService } from './vector.service.js';
import { ContextBuilder } from './context-builder.js';
import { logger } from '../../../utils/logger.js';

interface ExtractedMemoryFact {
  readonly content: string;
  readonly category: AgentMemoryCategory;
  readonly target: AgentMemoryTarget;
  readonly metadata: Record<string, unknown>;
}

const ORGANIZATION_IDENTITY_FIELDS = new Set([
  'school',
  'highSchool',
  'team.name',
  'team.school',
  'team.conference',
  'team.division',
  'team.league',
  'team.mascot',
  'team.city',
  'team.state',
  'team.schoolLogoUrl',
  'team.logoUrl',
  'coach.organization',
]);

export class SyncMemoryExtractorService {
  constructor(
    private readonly vectorMemory: VectorMemoryService,
    private readonly contextBuilder: ContextBuilder = new ContextBuilder(vectorMemory)
  ) {}

  async storeDeltaMemories(delta: SyncDeltaReport): Promise<number> {
    if (delta.isEmpty) return 0;

    const context = await this.contextBuilder.buildContext(delta.userId);
    const facts = this.extractFacts(delta, context);
    const seenFactKeys = new Set<string>();

    let stored = 0;
    for (const fact of facts) {
      const scope = this.resolveScope(fact.target, context);
      if (!scope) continue;

      const factKey = this.buildFactKey(delta.userId, fact, scope);
      if (seenFactKeys.has(factKey)) continue;
      seenFactKeys.add(factKey);

      const existing = await AgentMemoryModel.findOne({
        userId: delta.userId,
        target: scope.target,
        ...(scope.teamId ? { teamId: scope.teamId } : {}),
        ...(scope.organizationId ? { organizationId: scope.organizationId } : {}),
        category: fact.category,
        content: fact.content,
      }).lean();

      if (existing) continue;

      await this.vectorMemory.store(delta.userId, fact.content, fact.category, fact.metadata, {
        target: scope.target,
        teamId: scope.teamId,
        organizationId: scope.organizationId,
      });
      stored++;
    }

    logger.info('[SyncMemoryExtractor] Stored sync memories', {
      userId: delta.userId,
      sport: delta.sport,
      source: delta.source,
      factsCreated: stored,
    });

    return stored;
  }

  private extractFacts(delta: SyncDeltaReport, context: AgentUserContext): ExtractedMemoryFact[] {
    const facts: ExtractedMemoryFact[] = [];
    const dateLabel = delta.syncedAt.slice(0, 10);
    const sportLabel = delta.sport || context.sport || 'their sport';

    for (const change of delta.identityChanges) {
      facts.push({
        content: `On ${dateLabel}, ${change.field} changed from ${this.stringifyValue(change.oldValue)} to ${this.stringifyValue(change.newValue)} for the user's ${sportLabel} profile.`,
        category: 'profile_update',
        target: 'user',
        metadata: {
          source: delta.source,
          syncedAt: delta.syncedAt,
          field: change.field,
          oldValue: change.oldValue,
          newValue: change.newValue,
        },
      });

      if (this.isOrganizationIdentityField(change.field)) {
        facts.push({
          content: `On ${dateLabel}, the ${sportLabel} organization profile changed ${change.field} from ${this.stringifyValue(change.oldValue)} to ${this.stringifyValue(change.newValue)}.`,
          category: 'profile_update',
          target: 'organization',
          metadata: {
            source: delta.source,
            syncedAt: delta.syncedAt,
            field: change.field,
            oldValue: change.oldValue,
            newValue: change.newValue,
          },
        });
      }
    }

    for (const change of delta.statChanges) {
      facts.push({
        content: `On ${dateLabel}, ${change.label} in ${change.category} changed from ${this.stringifyValue(change.oldValue)} to ${this.stringifyValue(change.newValue)} for ${sportLabel}.`,
        category: 'performance_data',
        target: 'user',
        metadata: {
          source: delta.source,
          syncedAt: delta.syncedAt,
          statCategory: change.category,
          statKey: change.key,
          label: change.label,
          oldValue: change.oldValue,
          newValue: change.newValue,
          delta: change.delta,
        },
      });
    }

    for (const category of delta.newCategories) {
      facts.push({
        content: `On ${dateLabel}, a new ${category.category} stats category appeared for ${category.season} in ${sportLabel}, with ${category.totalCount} tracked values.`,
        category: 'performance_data',
        target: 'user',
        metadata: {
          source: delta.source,
          syncedAt: delta.syncedAt,
          season: category.season,
          category: category.category,
          columns: category.columns,
          totalCount: category.totalCount,
        },
      });
    }

    for (const activity of delta.newRecruitingActivities) {
      facts.push({
        content: `On ${dateLabel}, a new recruiting activity was detected for ${sportLabel}: ${this.stringifyRecruitingActivity(activity)}.`,
        category: 'recruiting_context',
        target: 'user',
        metadata: {
          source: delta.source,
          syncedAt: delta.syncedAt,
          activity,
        },
      });

      facts.push({
        content: `On ${dateLabel}, the ${sportLabel} organization logged a new athlete recruiting milestone: ${this.stringifyRecruitingActivity(activity)}.`,
        category: 'recruiting_context',
        target: 'organization',
        metadata: {
          source: delta.source,
          syncedAt: delta.syncedAt,
          activity,
        },
      });
    }

    for (const award of delta.newAwards) {
      facts.push({
        content: `On ${dateLabel}, the user added a new ${sportLabel} award or honor: ${this.stringifyRecruitingActivity(award)}.`,
        category: 'performance_data',
        target: 'user',
        metadata: {
          source: delta.source,
          syncedAt: delta.syncedAt,
          award,
        },
      });

      facts.push({
        content: `On ${dateLabel}, the ${sportLabel} organization added a new athlete honor: ${this.stringifyRecruitingActivity(award)}.`,
        category: 'performance_data',
        target: 'organization',
        metadata: {
          source: delta.source,
          syncedAt: delta.syncedAt,
          award,
        },
      });
    }

    for (const event of delta.newScheduleEvents) {
      facts.push({
        content: `On ${dateLabel}, the ${sportLabel} team schedule added an event${event.opponent ? ` against ${event.opponent}` : ''}${event.date ? ` on ${event.date}` : ''}.`,
        category: 'profile_update',
        target: 'team',
        metadata: {
          source: delta.source,
          syncedAt: delta.syncedAt,
          event,
        },
      });

      facts.push({
        content: `On ${dateLabel}, the ${sportLabel} organization schedule added an event${event.opponent ? ` against ${event.opponent}` : ''}${event.date ? ` on ${event.date}` : ''}.`,
        category: 'profile_update',
        target: 'organization',
        metadata: {
          source: delta.source,
          syncedAt: delta.syncedAt,
          event,
        },
      });
    }

    for (const video of delta.newVideos) {
      facts.push({
        content: `On ${dateLabel}, a new ${video.provider} video was detected for ${sportLabel}${video.title ? ` titled ${video.title}` : ''}.`,
        category: 'profile_update',
        target: 'user',
        metadata: {
          source: delta.source,
          syncedAt: delta.syncedAt,
          video,
        },
      });

      facts.push({
        content: `On ${dateLabel}, the ${sportLabel} organization media footprint added a new ${video.provider} video${video.title ? ` titled ${video.title}` : ''}.`,
        category: 'profile_update',
        target: 'organization',
        metadata: {
          source: delta.source,
          syncedAt: delta.syncedAt,
          video,
        },
      });
    }

    return facts;
  }

  private buildFactKey(
    userId: string,
    fact: ExtractedMemoryFact,
    scope: { target: AgentMemoryTarget; teamId?: string; organizationId?: string }
  ): string {
    return [
      userId,
      scope.target,
      scope.teamId ?? '',
      scope.organizationId ?? '',
      fact.category,
      fact.content,
    ].join('::');
  }

  private isOrganizationIdentityField(field: string): boolean {
    return ORGANIZATION_IDENTITY_FIELDS.has(field);
  }

  private resolveScope(
    target: AgentMemoryTarget,
    context: AgentUserContext
  ): { target: AgentMemoryTarget; teamId?: string; organizationId?: string } | null {
    if (target === 'team') {
      if (!context.teamId) {
        logger.debug('[SyncMemoryExtractor] Skipping team-scoped memory without teamId', {
          userId: context.userId,
        });
        return null;
      }

      return {
        target,
        teamId: context.teamId,
        organizationId: context.organizationId,
      };
    }

    if (target === 'organization') {
      if (!context.organizationId) {
        logger.debug('[SyncMemoryExtractor] Skipping org-scoped memory without organizationId', {
          userId: context.userId,
        });
        return null;
      }

      return {
        target,
        organizationId: context.organizationId,
      };
    }

    return {
      target: 'user',
      teamId: context.teamId,
      organizationId: context.organizationId,
    };
  }

  private stringifyValue(value: unknown): string {
    if (value === null || value === undefined || value === '') return 'empty';
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
      return String(value);
    }
    return JSON.stringify(value);
  }

  private stringifyRecruitingActivity(value: Record<string, unknown>): string {
    const summary = [
      value['type'],
      value['school'],
      value['program'],
      value['title'],
      value['label'],
      value['date'],
    ]
      .filter((part): part is string => typeof part === 'string' && part.trim().length > 0)
      .join(' | ');

    return summary || JSON.stringify(value);
  }
}
