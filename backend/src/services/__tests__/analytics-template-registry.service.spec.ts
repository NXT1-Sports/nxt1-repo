import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockCreate = vi.fn();
const mockFindOne = vi.fn();

vi.mock('../../models/analytics/analytics-custom-template.model.js', () => ({
  AnalyticsCustomEventTemplateModel: {
    create: (...args: unknown[]) => mockCreate(...args),
    findOne: (...args: unknown[]) => mockFindOne(...args),
  },
}));

vi.mock('../../utils/logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

const { AnalyticsTemplateRegistry } = await import('../analytics-template-registry.service.js');

describe('AnalyticsTemplateRegistry', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns the existing template when registration hits a duplicate normalized key', async () => {
    mockCreate.mockRejectedValue(
      new Error(
        'E11000 duplicate key error collection: analyticsCustomTemplates index: templateKey'
      )
    );
    mockFindOne.mockReturnValue({
      lean: vi.fn().mockResolvedValue({
        _id: 'tmpl_existing',
        templateKey: 'injury_report',
        displayName: 'Injury Report',
        description: 'Tracks injury updates',
        baseDomain: 'performance',
        canonicalEventType: 'injury_recorded',
        aliases: ['injury'],
        requiredPayloadFields: ['injuryType'],
        suggestedTags: ['health'],
        payloadSchemaVersion: '1.0.0',
        status: 'active',
        createdBy: 'agent-x',
        createdAt: new Date('2026-04-20T00:00:00.000Z'),
        lastUsedAt: null,
        usageCount: 9,
        metadata: {},
      }),
    });

    const registry = new AnalyticsTemplateRegistry();
    const result = await registry.register(
      {
        templateKey: 'Injury_Report',
        displayName: 'Injury Report',
        description: 'Tracks injury updates',
        baseDomain: 'performance',
        canonicalEventType: 'injury_recorded',
      },
      'user_123'
    );

    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        templateKey: 'injury_report',
        createdBy: 'user_123',
      })
    );
    expect(result).toMatchObject({
      id: 'tmpl_existing',
      templateKey: 'injury_report',
      baseDomain: 'performance',
      canonicalEventType: 'injury_recorded',
    });
  });
});
