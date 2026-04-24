/* eslint-disable @typescript-eslint/no-explicit-any */
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
    db: { collection } as any,
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

    vi.spyOn(service as any, 'buildCitations').mockReturnValue([
      { platform: 'hudl', label: 'Hudl' },
    ]);
    vi.spyOn(service as any, 'buildMissingDataPrompts').mockReturnValue([{ category: 'hasStats' }]);
    vi.spyOn(service as any, 'buildAthletePromptContext').mockResolvedValue({
      promptContextText: 'athlete-context',
      sport: 'basketball',
      primaryPosition: 'PG',
    });
    vi.spyOn(service as any, 'buildAthleteIntelPrompt').mockReturnValue('athlete prompt');

    const draft = await (service as any).generateAthleteIntelDraft(
      'user-1',
      { highlightVideoUrl: 'https://video.test/highlight.mp4' },
      {
        userData: {},
        stats: [],
        metrics: [{ id: 'metric-1' }],
        events: [],
        recruiting: [],
        awards: [],
        scoutReports: [],
        connectedSources: [],
      },
      {} as never
    );

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

    const result = await (service as any).saveAthleteIntelReport(
      'user-1',
      { sections: [], quickCommands: [] },
      db
    );

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

    vi.spyOn(service as any, 'buildCitations').mockReturnValue([
      { platform: 'maxpreps', label: 'MaxPreps' },
    ]);
    vi.spyOn(service as any, 'buildTeamIntelPrompt').mockReturnValue('team prompt');

    const draft = await (service as any).generateTeamIntelDraft(
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
    );

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

    const result = await (service as any).saveTeamIntelReport(
      'team-1',
      { sections: [], quickCommands: [] },
      db
    );

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

    vi.spyOn(service as any, 'gatherAthleteSectionData').mockResolvedValue({
      stats: [{ id: 'stat-1' }],
    });
    vi.spyOn(service as any, 'computeAthleteSectionAvailability').mockReturnValue({
      hasStats: true,
    });
    vi.spyOn(service as any, 'buildAthletePromptContext').mockResolvedValue({
      promptContextText: 'section-context',
      sport: 'football',
      primaryPosition: 'WR',
    });
    vi.spyOn(service as any, 'buildAthleteSectionPrompt').mockReturnValue('section prompt');

    const draft = await (service as any).generateAthleteIntelSectionDraft(
      'user-1',
      'season_stats',
      { displayName: 'Jordan Miles' },
      {} as never
    );

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

    const result = await (service as any).saveAthleteIntelSectionUpdate(
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
    );

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

    vi.spyOn(service as any, 'gatherTeamSectionData').mockResolvedValue({
      events: [{ id: 'event-1' }],
    });
    vi.spyOn(service as any, 'buildTeamSectionPrompt').mockReturnValue('team section prompt');

    const draft = await (service as any).generateTeamIntelSectionDraft(
      'team-1',
      'schedule',
      { teamName: 'Skyline Eagles' },
      {} as never
    );

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

    const result = await (service as any).saveTeamIntelSectionUpdate(
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
    );

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
