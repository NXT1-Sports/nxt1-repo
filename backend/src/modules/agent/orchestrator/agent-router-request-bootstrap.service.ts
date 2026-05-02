import type { AgentJobUpdate, AgentOperationResult, AgentUserContext } from '@nxt1/core';
import type { SemanticCacheService } from '../memory/semantic-cache.service.js';
import type { AgentRouterTelemetryService } from './agent-router-telemetry.service.js';
import { logger } from '../../../utils/logger.js';

type TelemetryDeps = Pick<AgentRouterTelemetryService, 'emitUpdate'>;

export class AgentRouterRequestBootstrapService {
  constructor(
    private readonly semanticCache: SemanticCacheService,
    private readonly telemetry: TelemetryDeps
  ) {}

  buildScopedCacheKey(intent: string, userContext: AgentUserContext | undefined): string {
    const role = userContext?.role ?? 'unknown';
    const sports =
      userContext?.sports
        ?.map((entry) => entry.sport.trim().toLowerCase())
        .filter((sport) => sport.length > 0)
        .sort() ?? [];
    const sportScope =
      sports.length > 0
        ? `sports:${sports.join(',')}`
        : `sport:${(userContext?.sport ?? 'general').trim().toLowerCase()}`;
    return `[${role}|${sportScope}] ${intent}`;
  }

  async trySemanticCache(payload: {
    readonly operationId: string;
    readonly userId: string;
    readonly intent: string;
    readonly scopedIntent: string;
    readonly userContext: AgentUserContext;
    readonly onUpdate?: (update: AgentJobUpdate) => void;
  }): Promise<AgentOperationResult | null> {
    const { operationId, userId, intent, scopedIntent, userContext, onUpdate } = payload;

    try {
      const cacheHit = await this.semanticCache.check(scopedIntent);
      if (!cacheHit) {
        return null;
      }

      logger.info('[AgentRouter] Semantic cache hit — personalizing for user', {
        operationId,
        score: cacheHit.score,
        cachedIntent: cacheHit.cachedIntent.slice(0, 80),
        userId,
      });

      this.telemetry.emitUpdate(
        onUpdate,
        operationId,
        'acting',
        'Found a cached answer — personalizing...',
        undefined,
        {
          agentId: 'router',
          stage: 'agent_thinking',
          metadata: { source: 'semantic_cache' },
        }
      );

      const personalized = await this.semanticCache.personalize(
        cacheHit.result,
        userContext,
        intent,
        operationId
      );

      this.telemetry.emitUpdate(
        onUpdate,
        operationId,
        'completed',
        personalized.summary,
        undefined,
        {
          agentId: 'router',
          stage: 'agent_thinking',
          outcomeCode: 'success_default',
          metadata: { source: 'semantic_cache' },
        }
      );

      return personalized;
    } catch {
      return null;
    }
  }
}
