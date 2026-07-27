import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockServerTimestamp, mockFieldValue, mockLogger } = vi.hoisted(() => {
  const serverTimestampValue = { __type: 'server-timestamp' };
  return {
    mockServerTimestamp: vi.fn(() => serverTimestampValue),
    mockFieldValue: {
      serverTimestamp: vi.fn(() => serverTimestampValue),
    },
    mockLogger: {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    },
  };
});

vi.mock('firebase-admin/firestore', () => ({
  getFirestore: vi.fn(() => ({ collection: vi.fn() })),
  FieldValue: mockFieldValue,
}));

vi.mock('../../../../utils/logger.js', () => ({
  logger: mockLogger,
}));

const { IntelGenerationService } = await import('../intel.service.js');

type IntelGenerationServiceTestAccess = {
  buildCitations: (...args: unknown[]) => unknown;
  buildMissingDataPrompts: (...args: unknown[]) => unknown;
  buildAthletePromptContext: (...args: unknown[]) => Promise<unknown>;
  buildAthleteIntelPrompt: (...args: unknown[]) => string;
  generateAthleteIntelDraft: (...args: unknown[]) => Promise<unknown>;
  saveAthleteIntelReport: (...args: unknown[]) => Promise<unknown>;
  buildTeamIntelPrompt: (...args: unknown[]) => string;
  generateTeamIntelDraft: (...args: unknown[]) => Promise<unknown>;
  saveTeamIntelReport: (...args: unknown[]) => Promise<unknown>;
  gatherAthleteSectionData: (...args: unknown[]) => Promise<unknown>;
  computeAthleteSectionAvailability: (...args: unknown[]) => unknown;
  buildAthleteSectionPrompt: (...args: unknown[]) => string;
  generateAthleteIntelSectionDraft: (...args: unknown[]) => Promise<unknown>;
  saveAthleteIntelSectionUpdate: (...args: unknown[]) => Promise<unknown>;
  gatherTeamSectionData: (...args: unknown[]) => Promise<unknown>;
  buildTeamSectionPrompt: (...args: unknown[]) => string;
  generateTeamIntelSectionDraft: (...args: unknown[]) => Promise<unknown>;
  saveTeamIntelSectionUpdate: (...args: unknown[]) => Promise<unknown>;
};

function createIntelReportsDb(collectionName: 'Users' | 'Teams', docId: string, reportId: string) {
  const set = vi.fn().mockResolvedValue(undefined);
  const doc = vi.fn((requestedId?: string) => {
    if (requestedId === docId) {
      return {
        collection: vi.fn((name: string) => {
          expect(name).toBe('intel_reports');
          return {
            doc: vi.fn(() => ({
              id: reportId,
              set,
            })),
          };
        }),
      };
    }

    throw new Error(`Unexpected doc id: ${String(requestedId)}`);
  });

  const collection = vi.fn((name: string) => {
    expect(name).toBe(collectionName);
    return { doc };
  });

  return {
    db: { collection } as never,
    set,
  };
}

describe('IntelGenerationService helper boundaries', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockServerTimestamp.mockClear();
    mockFieldValue.serverTimestamp.mockImplementation(() => ({ __type: 'server-timestamp' }));
  });

  it('generates an athlete intel draft from structured output and derived metadata', async () => {
    const llm = {
      complete: vi.fn().mockResolvedValue({
        parsedOutput: {
          sections: [{ id: 'agent_x_brief', content: 'Overview' }],
          quickCommands: [{ id: 'build-target-list', label: 'Build targets' }],
        },
      }),
    };

    const service = new IntelGenerationService(llm as never, undefined, {} as never);
    const serviceAccess = service as unknown as IntelGenerationServiceTestAccess;

    vi.spyOn(serviceAccess, 'buildCitations').mockReturnValue([
      { platform: 'hudl', label: 'Hudl' },
    ]);
    vi.spyOn(serviceAccess, 'buildMissingDataPrompts').mockReturnValue([{ category: 'hasStats' }]);
    vi.spyOn(serviceAccess, 'buildAthletePromptContext').mockResolvedValue({
      promptContextText: 'athlete-context',
      sport: 'basketball',
      primaryPosition: 'PG',
    });
    vi.spyOn(serviceAccess, 'buildAthleteIntelPrompt').mockReturnValue('athlete prompt');

    const draft = (await serviceAccess.generateAthleteIntelDraft(
      'user-1',
      { highlightVideoUrl: 'https://video.test/highlight.mp4' },
      {
        userData: {},
        stats: [],
        metrics: [{ id: 'metric-1' }],
        events: [],
        recruiting: [],
        awards: [],
        connectedSources: [],
      },
      {} as never
    )) as {
      parsed: { sections: unknown[] };
      sport: string;
      primaryPosition: string;
      citations: unknown[];
      dataAvailability: Record<string, boolean>;
      missingDataPrompts: unknown[];
    };

    expect(llm.complete).toHaveBeenCalledWith(
      expect.any(Array),
      expect.objectContaining({
        outputSchema: expect.objectContaining({ name: 'athlete_intel_report' }),
      })
    );
    expect(draft.parsed.sections).toHaveLength(1);
    expect(draft.sport).toBe('basketball');
    expect(draft.primaryPosition).toBe('PG');
    expect(draft.citations).toEqual([{ platform: 'hudl', label: 'Hudl' }]);
    expect(draft.dataAvailability).toMatchObject({
      hasMetrics: true,
      hasVideo: true,
      hasStats: false,
    });
    expect(draft.missingDataPrompts).toEqual([{ category: 'hasStats' }]);
  });

  it('persists an athlete intel report through the save helper boundary', async () => {
    const { db, set } = createIntelReportsDb('Users', 'user-1', 'report-athlete-1');
    const service = new IntelGenerationService(undefined, undefined, db);
    const serviceAccess = service as unknown as IntelGenerationServiceTestAccess;

    const result = (await serviceAccess.saveAthleteIntelReport(
      'user-1',
      { sections: [], quickCommands: [] },
      db
    )) as { id: string; sections: unknown[]; generatedAt: string };

    expect(set).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'report-athlete-1',
        generatedAt: expect.objectContaining({ __type: 'server-timestamp' }),
      })
    );
    expect(result).toEqual(
      expect.objectContaining({
        id: 'report-athlete-1',
        sections: [],
      })
    );
    expect(typeof result.generatedAt).toBe('string');
  });

  it('generates a team intel draft from structured output and citations', async () => {
    const llm = {
      complete: vi.fn().mockResolvedValue({
        parsedOutput: {
          sections: [{ id: 'agent_overview', content: 'Program overview' }],
          quickCommands: [{ id: 'scout-roster', label: 'Scout roster' }],
        },
      }),
    };

    const service = new IntelGenerationService(llm as never, undefined, {} as never);
    const serviceAccess = service as unknown as IntelGenerationServiceTestAccess;

    vi.spyOn(serviceAccess, 'buildCitations').mockReturnValue([
      { platform: 'maxpreps', label: 'MaxPreps' },
    ]);
    vi.spyOn(serviceAccess, 'buildTeamIntelPrompt').mockReturnValue('team prompt');

    const draft = (await serviceAccess.generateTeamIntelDraft(
      'team-1',
      {
        teamName: 'Skyline Eagles',
        sport: 'basketball',
        connectedSources: [],
      },
      {
        teamData: {},
        roster: [],
        staff: [],
        events: [],
        teamStats: [],
        playerStats: [],
        recruiting: [],
      },
      {} as never
    )) as {
      parsed: { sections: unknown[] };
      teamName: string;
      sport: string;
      citations: unknown[];
    };

    expect(llm.complete).toHaveBeenCalledWith(
      expect.any(Array),
      expect.objectContaining({
        outputSchema: expect.objectContaining({ name: 'team_intel_report' }),
      })
    );
    expect(draft.parsed.sections).toHaveLength(1);
    expect(draft.teamName).toBe('Skyline Eagles');
    expect(draft.sport).toBe('basketball');
    expect(draft.citations).toEqual([{ platform: 'maxpreps', label: 'MaxPreps' }]);
  });

  it('persists a team intel report through the save helper boundary', async () => {
    const { db, set } = createIntelReportsDb('Teams', 'team-1', 'report-team-1');
    const service = new IntelGenerationService(undefined, undefined, db);
    const serviceAccess = service as unknown as IntelGenerationServiceTestAccess;

    const result = (await serviceAccess.saveTeamIntelReport(
      'team-1',
      { sections: [], quickCommands: [] },
      db
    )) as { id: string; sections: unknown[]; generatedAt: string };

    expect(set).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'report-team-1',
        generatedAt: expect.objectContaining({ __type: 'server-timestamp' }),
      })
    );
    expect(result).toEqual(
      expect.objectContaining({
        id: 'report-team-1',
        sections: [],
      })
    );
    expect(typeof result.generatedAt).toBe('string');
  });

  it('generates an athlete section draft with section availability metadata', async () => {
    const llm = {
      complete: vi.fn().mockResolvedValue({
        parsedOutput: {
          id: 'season_stats',
          title: 'Stats',
          icon: 'stats-chart',
          content: 'Season stat summary',
        },
      }),
    };

    const service = new IntelGenerationService(llm as never, undefined, {} as never);
    const serviceAccess = service as unknown as IntelGenerationServiceTestAccess;

    vi.spyOn(serviceAccess, 'gatherAthleteSectionData').mockResolvedValue({
      stats: [{ id: 'stat-1' }],
    });
    vi.spyOn(serviceAccess, 'computeAthleteSectionAvailability').mockReturnValue({
      hasStats: true,
    });
    vi.spyOn(serviceAccess, 'buildAthletePromptContext').mockResolvedValue({
      promptContextText: 'section-context',
      sport: 'football',
      primaryPosition: 'WR',
    });
    vi.spyOn(serviceAccess, 'buildAthleteSectionPrompt').mockReturnValue('section prompt');

    const draft = (await serviceAccess.generateAthleteIntelSectionDraft(
      'user-1',
      'season_stats',
      { displayName: 'Jordan Miles' },
      {} as never
    )) as { parsedSection: Record<string, unknown>; sectionAvailability: Record<string, boolean> };

    expect(llm.complete).toHaveBeenCalledWith(
      expect.any(Array),
      expect.objectContaining({
        outputSchema: expect.objectContaining({ name: 'athlete_intel_section' }),
      })
    );
    expect(draft.parsedSection).toEqual(
      expect.objectContaining({ id: 'season_stats', content: 'Season stat summary' })
    );
    expect(draft.sectionAvailability).toEqual({ hasStats: true });
  });

  it('persists an athlete section update and inserts missing sections in canonical order', async () => {
    const update = vi.fn().mockResolvedValue(undefined);
    const service = new IntelGenerationService();
    const serviceAccess = service as unknown as IntelGenerationServiceTestAccess;

    const result = (await serviceAccess.saveAthleteIntelSectionUpdate(
      { id: 'report-athlete-1', ref: { update } },
      { sections: [{ id: 'agent_x_brief', content: 'Existing overview' }] },
      [{ id: 'agent_x_brief', title: 'Overview', icon: 'sparkles', content: 'Existing overview' }],
      'athletic_measurements',
      {
        id: 'athletic_measurements',
        title: 'Metrics',
        icon: 'body',
        content: 'Updated metrics',
      }
    )) as { id: string; sections: Array<Record<string, unknown>> };

    const updatedSections = (result.sections as Array<Record<string, unknown>>).map(
      (section) => section.id
    );

    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        sections: expect.any(Array),
        updatedAt: expect.objectContaining({ __type: 'server-timestamp' }),
      })
    );
    expect(updatedSections).toEqual(['agent_x_brief', 'athletic_measurements']);
    expect(result.id).toBe('report-athlete-1');
  });

  it('generates a team section draft with the section raw payload for no-data overrides', async () => {
    const llm = {
      complete: vi.fn().mockResolvedValue({
        parsedOutput: {
          id: 'schedule',
          title: 'Schedule',
          icon: 'calendar',
          content: 'Upcoming games summary',
        },
      }),
    };

    const service = new IntelGenerationService(llm as never, undefined, {} as never);
    const serviceAccess = service as unknown as IntelGenerationServiceTestAccess;

    vi.spyOn(serviceAccess, 'gatherTeamSectionData').mockResolvedValue({
      events: [{ id: 'event-1' }],
    });
    vi.spyOn(serviceAccess, 'buildTeamSectionPrompt').mockReturnValue('team section prompt');

    const draft = (await serviceAccess.generateTeamIntelSectionDraft(
      'team-1',
      'schedule',
      { teamName: 'Skyline Eagles' },
      {} as never
    )) as { parsedSection: Record<string, unknown>; sectionRaw: Record<string, unknown> };

    expect(llm.complete).toHaveBeenCalledWith(
      expect.any(Array),
      expect.objectContaining({
        outputSchema: expect.objectContaining({ name: 'team_intel_section' }),
      })
    );
    expect(draft.parsedSection).toEqual(
      expect.objectContaining({ id: 'schedule', content: 'Upcoming games summary' })
    );
    expect(draft.sectionRaw).toEqual({ events: [{ id: 'event-1' }] });
  });

  it('persists a team section update by replacing the matching section in place', async () => {
    const update = vi.fn().mockResolvedValue(undefined);
    const service = new IntelGenerationService();
    const serviceAccess = service as unknown as IntelGenerationServiceTestAccess;

    const result = (await serviceAccess.saveTeamIntelSectionUpdate(
      { id: 'report-team-1', ref: { update } },
      {
        sections: [
          { id: 'agent_overview', content: 'Overview' },
          { id: 'team', content: 'Old team section' },
        ],
      },
      [
        { id: 'agent_overview', title: 'Agent Overview', icon: 'sparkles', content: 'Overview' },
        { id: 'team', title: 'Team', icon: 'people', content: 'Old team section' },
      ],
      'team',
      {
        id: 'team',
        title: 'Team',
        icon: 'people',
        content: 'Updated team section',
      }
    )) as { id: string; sections: Array<Record<string, unknown>> };

    const updatedSection = (result.sections as Array<Record<string, unknown>>).find(
      (section) => section.id === 'team'
    );

    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        sections: expect.any(Array),
        updatedAt: expect.objectContaining({ __type: 'server-timestamp' }),
      })
    );
    expect(updatedSection).toEqual(
      expect.objectContaining({ id: 'team', content: 'Updated team section' })
    );
    expect(result.id).toBe('report-team-1');
  });
});
