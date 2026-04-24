import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SyncDeltaReport } from '@nxt1/core';

const mockLogger = {
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
};

vi.mock('../../../../utils/logger.js', () => ({
  logger: mockLogger,
}));

vi.mock('../context-builder.js', () => ({
  ContextBuilder: class {
    buildContext = vi.fn();
  },
}));

const { AgentMemoryModel } = await import('../vector.service.js');
const { SyncMemoryExtractorService } = await import('../sync-memory-extractor.service.js');

function createDelta(overrides: Partial<SyncDeltaReport> = {}): SyncDeltaReport {
  return {
    userId: 'user-1',
    sport: 'football',
    source: 'maxpreps',
    syncedAt: '2026-04-13T12:00:00.000Z',
    isEmpty: false,
    identityChanges: [],
    newCategories: [],
    statChanges: [],
    newRecruitingActivities: [],
    newAwards: [],
    newScheduleEvents: [],
    newVideos: [],
    summary: {
      identityFieldsChanged: 0,
      newCategoriesAdded: 0,
      statsUpdated: 0,
      newRecruitingActivities: 0,
      newAwards: 0,
      newScheduleEvents: 0,
      newVideos: 0,
      totalChanges: 0,
    },
    ...overrides,
  };
}

describe('SyncMemoryExtractorService', () => {
  const vectorMemory = {
    store: vi.fn().mockResolvedValue({ id: 'memory-1' }),
  };

  const llm = {
    complete: vi.fn(),
  };

  const contextBuilder = {
    buildContext: vi.fn().mockResolvedValue({
      userId: 'user-1',
      sport: 'football',
      teamId: 'team-7',
      organizationId: 'org-7',
    }),
  };

  let service: InstanceType<typeof SyncMemoryExtractorService>;

  beforeEach(() => {
    vi.clearAllMocks();
    llm.complete.mockReset();
    service = new SyncMemoryExtractorService(vectorMemory as never, contextBuilder as never);
  });

  it('uses AI extraction to write cleaner scoped sync memories when an LLM is available', async () => {
    llm.complete.mockResolvedValue({
      content: JSON.stringify([
        {
          content: 'The athlete opened the football season with strong passing production.',
          category: 'performance_data',
          target: 'user',
        },
        {
          content: 'The football program added a new recruiting milestone.',
          category: 'recruiting_context',
          target: 'organization',
        },
      ]),
    });

    vi.spyOn(AgentMemoryModel, 'findOne').mockImplementation(
      () => ({ lean: vi.fn().mockResolvedValue(null) }) as never
    );

    const aiService = new SyncMemoryExtractorService(
      vectorMemory as never,
      contextBuilder as never,
      llm as never
    );

    const stored = await aiService.storeDeltaMemories(
      createDelta({
        statChanges: [
          {
            category: 'Passing',
            key: 'yards',
            label: 'Passing Yards',
            oldValue: null,
            newValue: 2410,
            delta: 2410,
          },
        ],
        newRecruitingActivities: [{ type: 'offer', school: 'State University' }],
      })
    );

    expect(stored).toBe(2);
    expect(llm.complete).toHaveBeenCalledOnce();
    expect(vectorMemory.store).toHaveBeenNthCalledWith(
      1,
      'user-1',
      'The athlete opened the football season with strong passing production.',
      'performance_data',
      expect.any(Object),
      {
        target: 'user',
        teamId: 'team-7',
        organizationId: 'org-7',
      }
    );
    expect(vectorMemory.store).toHaveBeenNthCalledWith(
      2,
      'user-1',
      'The football program added a new recruiting milestone.',
      'recruiting_context',
      expect.any(Object),
      {
        target: 'organization',
        organizationId: 'org-7',
      }
    );
  });

  it('stores organization-scoped memories for profile, recruiting, award, schedule, and video deltas', async () => {
    vi.spyOn(AgentMemoryModel, 'findOne').mockImplementation(
      () => ({ lean: vi.fn().mockResolvedValue(null) }) as never
    );

    const stored = await service.storeDeltaMemories(
      createDelta({
        identityChanges: [
          { field: 'school', oldValue: 'Old High', newValue: 'New High' },
          { field: 'team.conference', oldValue: 'District 10', newValue: 'District 12' },
        ],
        newRecruitingActivities: [{ type: 'offer', school: 'State University' }],
        newAwards: [{ title: 'All-District First Team' }],
        newScheduleEvents: [{ date: '2026-04-20', opponent: 'Central High' }],
        newVideos: [{ src: 'https://hudl.com/1', provider: 'Hudl', title: 'Senior Reel' }],
      })
    );

    const orgStores = vectorMemory.store.mock.calls.filter(
      (call) => call[4]?.target === 'organization'
    );

    expect(stored).toBe(16);
    expect(orgStores).toHaveLength(6);
    expect(orgStores.map((call) => call[1])).toEqual(
      expect.arrayContaining([
        expect.stringContaining('organization profile changed school'),
        expect.stringContaining('organization profile changed team.conference'),
        expect.stringContaining('organization logged a new athlete recruiting milestone'),
        expect.stringContaining('organization added a new athlete honor'),
        expect.stringContaining('organization schedule added an event against Central High'),
        expect.stringContaining(
          'organization media footprint added a new Hudl video titled Senior Reel'
        ),
      ])
    );
  });

  it('dedupes scoped schedule facts within a run and skips existing scoped memories', async () => {
    const findOneSpy = vi.spyOn(AgentMemoryModel, 'findOne').mockImplementation(
      (query: Record<string, unknown>) =>
        ({
          lean: vi
            .fn()
            .mockResolvedValue(
              query['target'] === 'organization' ? { _id: 'existing-org-memory' } : null
            ),
        }) as never
    );

    const stored = await service.storeDeltaMemories(
      createDelta({
        newScheduleEvents: [
          { date: '2026-04-20', opponent: 'Central High' },
          { date: '2026-04-20', opponent: 'Central High' },
        ],
      })
    );

    expect(stored).toBe(1);
    expect(findOneSpy).toHaveBeenCalledTimes(2);
    expect(vectorMemory.store).toHaveBeenCalledTimes(1);
    expect(vectorMemory.store).toHaveBeenCalledWith(
      'user-1',
      expect.stringContaining('team schedule added an event against Central High on 2026-04-20'),
      'profile_update',
      expect.any(Object),
      {
        target: 'team',
        teamId: 'team-7',
        organizationId: 'org-7',
      }
    );
  });

  it('fans out coach and athlete profile facts into user, team, and organization scopes', async () => {
    vi.spyOn(AgentMemoryModel, 'findOne').mockImplementation(
      () => ({ lean: vi.fn().mockResolvedValue(null) }) as never
    );

    const stored = await service.storeDeltaMemories(
      createDelta({
        identityChanges: [
          { field: 'team.conference', oldValue: 'District 10', newValue: 'District 12' },
        ],
        newAwards: [{ title: 'Regional Coach of the Year' }],
        newRecruitingActivities: [{ type: 'offer', school: 'State University' }],
        newVideos: [{ src: 'https://hudl.com/2', provider: 'Hudl', title: 'Spring Practice' }],
      })
    );

    const targets = vectorMemory.store.mock.calls.map((call) => call[4]?.target);

    expect(stored).toBeGreaterThanOrEqual(8);
    expect(targets).toContain('user');
    expect(targets).toContain('team');
    expect(targets).toContain('organization');
  });
});
