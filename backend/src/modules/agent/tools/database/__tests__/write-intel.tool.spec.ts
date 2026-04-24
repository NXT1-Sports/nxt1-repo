import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockGenerateAthleteIntel, mockGenerateTeamIntel } = vi.hoisted(() => ({
  mockGenerateAthleteIntel: vi.fn().mockResolvedValue({
    id: 'athlete_intel_001',
    userId: 'user_123',
    sections: [],
    generatedAt: new Date().toISOString(),
  }),
  mockGenerateTeamIntel: vi.fn().mockResolvedValue({
    id: 'team_intel_001',
    teamId: 'team_456',
    sections: [],
    generatedAt: new Date().toISOString(),
  }),
}));

vi.mock('../../../services/intel.service.js', () => ({
  IntelGenerationService: class {
    generateAthleteIntel = mockGenerateAthleteIntel;
    generateTeamIntel = mockGenerateTeamIntel;
  },
}));

vi.mock('../../../../../utils/logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

import { WriteIntelTool } from '../write-intel.tool.js';

describe('WriteIntelTool', () => {
  let tool: WriteIntelTool;

  beforeEach(() => {
    vi.clearAllMocks();
    tool = new WriteIntelTool({} as never);
  });

  it('exposes expected metadata', () => {
    expect(tool.name).toBe('write_intel');
    expect(tool.isMutation).toBe(true);
    expect(tool.category).toBe('database');
    expect(tool.allowedAgents).toContain('performance_coordinator');
    expect(tool.allowedAgents).toContain('strategy_coordinator');
  });

  it('requires entityType and entityId', async () => {
    const missingEntityType = await tool.execute({ entityType: '', entityId: 'user_123' });
    expect(missingEntityType.success).toBe(false);
    expect(missingEntityType.error).toMatch(/entityType/i);

    const missingEntityId = await tool.execute({ entityType: 'athlete', entityId: '' });
    expect(missingEntityId.success).toBe(false);
    expect(missingEntityId.error).toContain('entityId');
  });

  it('rejects unknown entityType', async () => {
    const result = await tool.execute({ entityType: 'coach', entityId: 'user_123' });
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/entityType/i);
  });

  it('delegates athlete intel to IntelGenerationService and returns reportId', async () => {
    const result = await tool.execute(
      { entityType: 'athlete', entityId: 'user_123' },
      { userId: 'user_123' }
    );

    expect(result.success).toBe(true);
    expect(mockGenerateAthleteIntel).toHaveBeenCalledWith('user_123', expect.anything());
    expect(mockGenerateTeamIntel).not.toHaveBeenCalled();
    expect((result.data as Record<string, unknown>)['reportId']).toBe('athlete_intel_001');
    expect((result.data as Record<string, unknown>)['entityType']).toBe('athlete');
  });

  it('delegates team intel to IntelGenerationService and returns reportId', async () => {
    const result = await tool.execute(
      { entityType: 'team', entityId: 'team_456' },
      { userId: 'coach_123' }
    );

    expect(result.success).toBe(true);
    expect(mockGenerateTeamIntel).toHaveBeenCalledWith('team_456', expect.anything());
    expect(mockGenerateAthleteIntel).not.toHaveBeenCalled();
    expect((result.data as Record<string, unknown>)['reportId']).toBe('team_intel_001');
    expect((result.data as Record<string, unknown>)['entityType']).toBe('team');
  });

  it('returns failure if IntelGenerationService throws', async () => {
    mockGenerateAthleteIntel.mockRejectedValueOnce(new Error('User not found'));

    const result = await tool.execute({ entityType: 'athlete', entityId: 'missing_user' });

    expect(result.success).toBe(false);
    expect(result.error).toBe('User not found');
  });
});
