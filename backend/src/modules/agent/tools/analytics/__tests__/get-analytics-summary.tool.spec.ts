import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockGetSummary = vi.fn();
const mockRollupFindLean = vi.fn();
const mockRollupFind = vi.fn(() => ({ lean: mockRollupFindLean }));
const mockEventAggregate = vi.fn();

const stagingExistingDocs = new Map<string, Set<string>>();
const productionExistingDocs = new Map<string, Set<string>>();

function createFirestoreMock(existingDocs: Map<string, Set<string>>) {
  return {
    collection: vi.fn((collectionName: string) => ({
      doc: vi.fn((documentId: string) => ({
        get: vi.fn().mockResolvedValue({
          exists: existingDocs.get(collectionName)?.has(documentId) ?? false,
        }),
      })),
    })),
  };
}

vi.mock('../../../../../models/analytics/analytics-rollup.model.js', () => ({
  AnalyticsRollupModel: {
    find: (...args: unknown[]) => mockRollupFind(...args),
  },
}));

vi.mock('../../../../../models/analytics/analytics-event.model.js', () => ({
  AnalyticsEventModel: {
    aggregate: (...args: unknown[]) => mockEventAggregate(...args),
  },
}));

vi.mock('../../../../../config/runtime-environment.js', () => ({
  getRuntimeEnvironment: () => 'staging',
}));

vi.mock('../../../../../utils/firebase-staging.js', () => ({
  stagingDb: createFirestoreMock(stagingExistingDocs),
}));

vi.mock('../../../../../utils/firebase.js', () => ({
  db: createFirestoreMock(productionExistingDocs),
}));

const { GetAnalyticsSummaryTool } = await import('../get-analytics-summary.tool.js');

describe('GetAnalyticsSummaryTool', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    stagingExistingDocs.clear();
    productionExistingDocs.clear();
    mockRollupFindLean.mockResolvedValue([]);
    mockEventAggregate.mockResolvedValue([]);
    mockGetSummary.mockResolvedValue({
      subjectId: 'user_123',
      subjectType: 'user',
      domain: 'engagement',
      timeframe: '30d',
      totalCount: 0,
      numericValueTotal: 0,
      countsByEventType: {},
      lastEventAt: null,
      lastAggregatedAt: null,
    });
  });

  it('uses the explicit subjectType when it is provided', async () => {
    const tool = new GetAnalyticsSummaryTool({ getSummary: mockGetSummary } as never);

    await tool.execute({
      userId: 'user_123',
      subjectId: 'org_456',
      subjectType: 'organization',
      domain: 'engagement',
    });

    expect(mockGetSummary).toHaveBeenCalledWith(
      expect.objectContaining({
        subjectId: 'org_456',
        subjectType: 'organization',
      })
    );
    expect(mockRollupFind).not.toHaveBeenCalled();
  });

  it('resolves team analytics from existing rollups when subjectType is omitted', async () => {
    mockRollupFindLean.mockResolvedValue([{ subjectType: 'team', totalCount: 18 }]);
    mockGetSummary.mockResolvedValue({
      subjectId: 'team_42',
      subjectType: 'team',
      domain: 'engagement',
      timeframe: '30d',
      totalCount: 18,
      numericValueTotal: 0,
      countsByEventType: { profile_viewed: 18 },
      lastEventAt: '2026-05-01T00:00:00.000Z',
      lastAggregatedAt: '2026-05-01T00:05:00.000Z',
    });

    const tool = new GetAnalyticsSummaryTool({ getSummary: mockGetSummary } as never);
    const result = await tool.execute(
      {
        userId: 'user_123',
        subjectId: 'team_42',
        domain: 'engagement',
      },
      { userId: 'user_123', environment: 'staging' }
    );

    expect(mockGetSummary).toHaveBeenCalledWith(
      expect.objectContaining({
        subjectId: 'team_42',
        subjectType: 'team',
      })
    );
    expect(result.success).toBe(true);
    expect(result.data).toEqual(
      expect.objectContaining({
        resolvedSubjectType: 'team',
        subjectTypeResolution: 'analytics_rollup',
      })
    );
  });

  it('resolves organization analytics from Firestore when analytics rows are missing', async () => {
    stagingExistingDocs.set('Organizations', new Set(['org_789']));
    mockGetSummary.mockResolvedValue({
      subjectId: 'org_789',
      subjectType: 'organization',
      domain: 'communication',
      timeframe: '30d',
      totalCount: 3,
      numericValueTotal: 0,
      countsByEventType: { email_opened: 3 },
      lastEventAt: '2026-05-02T00:00:00.000Z',
      lastAggregatedAt: '2026-05-02T00:05:00.000Z',
    });

    const tool = new GetAnalyticsSummaryTool({ getSummary: mockGetSummary } as never);
    const result = await tool.execute(
      {
        userId: 'user_123',
        subjectId: 'org_789',
        domain: 'communication',
      },
      { userId: 'user_123', environment: 'staging' }
    );

    expect(mockGetSummary).toHaveBeenCalledWith(
      expect.objectContaining({
        subjectId: 'org_789',
        subjectType: 'organization',
      })
    );
    expect(result.success).toBe(true);
    expect(result.data).toEqual(
      expect.objectContaining({
        resolvedSubjectType: 'organization',
        subjectTypeResolution: 'firestore_entity',
      })
    );
  });
});
