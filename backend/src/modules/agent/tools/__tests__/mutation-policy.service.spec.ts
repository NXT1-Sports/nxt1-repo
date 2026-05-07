import { beforeEach, describe, expect, it, vi } from 'vitest';

const safeTrack = vi.fn(async () => undefined);
const recordDelta = vi.fn(async () => ({ eventId: 'evt_1', promptSummary: 'ok' }));
const storeDeltaMemories = vi.fn(async () => 1);

type OutboxRow = {
  executionKey: string;
  step: string;
  status: 'completed' | 'failed';
};

const outbox = new Map<string, OutboxRow>();

const queryResult = <T>(value: T) => ({
  select: vi.fn().mockReturnThis(),
  lean: vi.fn().mockReturnThis(),
  exec: vi.fn(async () => value),
});

vi.mock('../../../../models/agent/agent-mutation-policy-outbox.model.js', () => ({
  AgentMutationPolicyOutboxModel: {
    findOne: vi.fn((query: { executionKey: string; step: string; status: string }) => {
      const key = `${query.executionKey}:${query.step}`;
      const row = outbox.get(key);
      if (row && row.status === query.status) {
        return queryResult({ _id: 'row_1' });
      }
      return queryResult(null);
    }),
    findOneAndUpdate: vi.fn(
      (
        query: { executionKey: string; step: string },
        update: {
          $set: { status: 'completed' | 'failed' };
        }
      ) => {
        return {
          exec: vi.fn(async () => {
            const key = `${query.executionKey}:${query.step}`;
            outbox.set(key, {
              executionKey: query.executionKey,
              step: query.step,
              status: update.$set.status,
            });
            return {};
          }),
        };
      }
    ),
  },
}));

vi.mock('../../../../services/core/analytics-logger.service.js', () => ({
  getAnalyticsLoggerService: () => ({
    safeTrack,
  }),
}));

vi.mock('../../../../services/core/sync-delta-event.service.js', () => ({
  getSyncDeltaEventService: () => ({
    record: recordDelta,
  }),
}));

vi.mock('../../llm/openrouter.service.js', () => ({
  OpenRouterService: class OpenRouterService {},
}));

vi.mock('../../memory/vector.service.js', () => ({
  VectorMemoryService: class VectorMemoryService {
    constructor(_llm: unknown) {}
  },
}));

vi.mock('../../memory/context-builder.js', () => ({
  ContextBuilder: class ContextBuilder {
    constructor(_vector: unknown) {}
  },
}));

vi.mock('../../memory/sync-memory-extractor.service.js', () => ({
  SyncMemoryExtractorService: class SyncMemoryExtractorService {
    async storeDeltaMemories(delta: unknown) {
      return storeDeltaMemories(delta);
    }
  },
}));

describe('AgentMutationPolicyService', () => {
  beforeEach(() => {
    outbox.clear();
    safeTrack.mockClear();
    recordDelta.mockClear();
    storeDeltaMemories.mockClear();
  });

  it('runs analytics + sync delta + memory for sync-profiled mutation tools', async () => {
    const { AgentMutationPolicyService } = await import('../mutation-policy.service.js');
    const service = new AgentMutationPolicyService();

    await service.apply({
      toolName: 'write_schedule',
      input: {
        userId: 'user_1',
        sport: 'basketball',
        source: 'hudl',
        schedule: [
          {
            date: '2026-11-01',
            opponent: 'North High',
            location: 'Home',
          },
        ],
      },
      context: {
        userId: 'user_1',
        operationId: 'op_1',
      },
    });

    expect(safeTrack).toHaveBeenCalledOnce();
    expect(recordDelta).toHaveBeenCalledOnce();
    expect(storeDeltaMemories).toHaveBeenCalledOnce();
  });

  it('uses synthetic fallback when adapter cannot resolve typed input, while still running sync+memory', async () => {
    const { AgentMutationPolicyService } = await import('../mutation-policy.service.js');
    const service = new AgentMutationPolicyService();

    await service.apply({
      toolName: 'write_season_stats',
      input: {
        userId: 'user_1',
        sportId: 'football',
      },
      context: {
        userId: 'user_1',
        operationId: 'op_2',
      },
    });

    expect(safeTrack).toHaveBeenCalledOnce();
    expect(recordDelta).toHaveBeenCalledOnce();
    expect(storeDeltaMemories).toHaveBeenCalledOnce();

    const deltaArg = recordDelta.mock.calls[0]?.[0] as Record<string, unknown>;
    expect((deltaArg['metadata'] as Record<string, unknown>)?.['generationType']).toBe('synthetic');
    expect((deltaArg['metadata'] as Record<string, unknown>)?.['fallbackReason']).toBeTruthy();
  });

  it('dedupes repeated executions by execution key and step', async () => {
    const { AgentMutationPolicyService } = await import('../mutation-policy.service.js');
    const service = new AgentMutationPolicyService();

    const payload = {
      toolName: 'write_schedule',
      input: {
        userId: 'user_1',
        sport: 'basketball',
        source: 'hudl',
        schedule: [
          {
            date: '2026-10-15',
            opponent: 'South High',
          },
        ],
      },
      context: {
        userId: 'user_1',
        operationId: 'op_3',
      },
    } as const;

    await service.apply(payload);
    await service.apply(payload);

    expect(safeTrack).toHaveBeenCalledOnce();
    expect(recordDelta).toHaveBeenCalledOnce();
    expect(storeDeltaMemories).toHaveBeenCalledOnce();
  });

  it('produces typed playbook deltas for write_playbooks', async () => {
    const { AgentMutationPolicyService } = await import('../mutation-policy.service.js');
    const service = new AgentMutationPolicyService();

    await service.apply({
      toolName: 'write_playbooks',
      input: {
        userId: 'user_1',
        sport: 'football',
        source: 'hudl',
        playbooks: [
          {
            name: 'Cover 2 Package',
            sport: 'football',
            playCount: 4,
            formationTypes: ['nickel', 'dime'],
            videoRefs: ['video-1'],
          },
        ],
      },
      context: {
        userId: 'user_1',
        operationId: 'op_4',
      },
    });

    expect(recordDelta).toHaveBeenCalledOnce();
    const deltaArg = recordDelta.mock.calls[0]?.[0] as Record<string, unknown>;
    expect((deltaArg['metadata'] as Record<string, unknown>)?.['generationType']).toBe('typed');

    const summary = deltaArg['summary'] as Record<string, unknown>;
    expect(Number(summary['newPlaybooks'] ?? 0)).toBeGreaterThan(0);
  });
});
