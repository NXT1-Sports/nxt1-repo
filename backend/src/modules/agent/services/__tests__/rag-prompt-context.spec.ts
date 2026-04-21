/* eslint-disable @typescript-eslint/no-explicit-any */
import { afterEach, describe, expect, it, vi } from 'vitest';

const mockCache = {
  get: vi.fn(),
  set: vi.fn(),
  del: vi.fn(),
  clear: vi.fn(),
  exists: vi.fn(),
  mget: vi.fn(),
  mset: vi.fn(),
};

vi.mock('../../../../services/cache.service.js', () => ({
  getCacheService: () => mockCache,
  CACHE_TTL: { PROFILES: 900 },
}));

vi.mock('../../../../services/users.service.js', () => ({
  getUserById: vi.fn(),
}));

vi.mock('../../../../services/team-adapter.service.js', () => ({
  TeamServiceAdapter: class {
    getUserTeams = vi.fn().mockResolvedValue([]);
  },
}));

vi.mock('firebase-admin/firestore', () => ({
  getFirestore: vi.fn(() => ({ collection: vi.fn() })),
}));

vi.mock('../../../../utils/logger.js', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

const { AgentGenerationService } = await import('../generation.service.js');
const { IntelGenerationService } = await import('../intel.service.js');
const { ContextBuilder } = await import('../../memory/context-builder.js');
const { getRecurringHabitsPrompt, resolvePrimarySport } =
  await import('../../memory/context-builder.js');

describe('RAG-backed prompt context helpers', () => {
  const fakeDb = {} as never;

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('uses vector-backed prompt context for playbook and briefing generation', async () => {
    const profile = { userId: 'user-1', role: 'athlete', displayName: 'Jordan Miles' };
    const memories = {
      user: [{ content: 'Targets SEC schools' }],
      team: [],
      organization: [],
    };

    const contextBuilder = {
      buildPromptContext: vi.fn().mockResolvedValue({ profile, memories }),
      compressToPrompt: vi.fn().mockReturnValue('compressed-rag-context'),
    } as unknown as ContextBuilder;

    const service = new AgentGenerationService(undefined, contextBuilder);
    const result = await (service as any).buildPromptContextText(
      'user-1',
      'weekly playbook planning',
      fakeDb
    );

    expect((contextBuilder as any).buildPromptContext).toHaveBeenCalledWith(
      'user-1',
      'weekly playbook planning',
      fakeDb
    );
    expect((contextBuilder as any).compressToPrompt).toHaveBeenCalledWith(profile, memories, []);
    expect(result).toBe('compressed-rag-context');
  });

  it('falls back to profile-only prompt context when vector retrieval fails', async () => {
    const contextBuilder = {
      buildPromptContext: vi.fn().mockRejectedValue(new Error('vector unavailable')),
    } as unknown as ContextBuilder;

    const fallbackProfile = {
      userId: 'user-1',
      role: 'athlete',
      displayName: 'Fallback Athlete',
    };

    const buildContextSpy = vi
      .spyOn(ContextBuilder.prototype, 'buildContext')
      .mockResolvedValue(fallbackProfile as never);
    const compressToPromptSpy = vi
      .spyOn(ContextBuilder.prototype, 'compressToPrompt')
      .mockReturnValue('fallback-context');

    const service = new AgentGenerationService(undefined, contextBuilder);
    const result = await (service as any).buildPromptContextText(
      'user-1',
      'daily briefing planning',
      fakeDb
    );

    expect(buildContextSpy).toHaveBeenCalledWith('user-1', fakeDb);
    expect(compressToPromptSpy).toHaveBeenCalledWith(fallbackProfile);
    expect(result).toBe('fallback-context');
  });

  it('preserves season and role scaffolding for planning prompts', () => {
    const service = new AgentGenerationService();

    const result = (service as any).buildPlanningScaffolding(
      'football',
      { role: 'athlete' },
      new Date('2026-09-15T12:00:00.000Z')
    );

    expect(result).toContain('For football, this is the In-Season period');
    expect(result).toContain('Adopt an encouraging, urgent, and mentorship-driven tone.');
    expect(result).toContain("The user's stated goals are the top priority");
  });

  it('resolves primary sport from the active sport profile for multi-sport users', () => {
    const result = resolvePrimarySport({
      activeSportIndex: 1,
      primarySport: 'football',
      sport: 'football',
      sports: [{ sport: 'football' }, { sport: 'basketball' }],
    });

    expect(result).toBe('basketball');
  });

  it('uses the active sport team type when choosing coach recurring habits', () => {
    const result = getRecurringHabitsPrompt(
      'coach',
      'basketball',
      new Date('2026-11-10T12:00:00.000Z'),
      {
        activeSportIndex: 1,
        sports: [
          { sport: 'football', team: { type: 'high-school' } },
          { sport: 'basketball', team: { type: 'college' } },
        ],
      }
    );

    expect(result).toContain(
      'Review updated athlete profiles and recent stat uploads from your roster'
    );
    expect(result).not.toContain('Finalize your weekly practice plan and player rotations');
  });

  it('uses vector-backed athlete prompt context for intel generation', async () => {
    const profile = {
      userId: 'user-99',
      role: 'athlete',
      displayName: 'Jordan Miles',
      sport: 'basketball',
      position: 'PG',
    };
    const memories = {
      user: [{ content: 'Ran a verified 4.58 forty this spring' }],
      team: [],
      organization: [],
    };

    const contextBuilder = {
      buildPromptContext: vi.fn().mockResolvedValue({ profile, memories }),
      compressToPrompt: vi.fn().mockReturnValue('athlete-rag-context'),
    } as unknown as ContextBuilder;

    const service = new IntelGenerationService(undefined, contextBuilder);
    const result = await (service as any).buildAthletePromptContext(
      'user-99',
      {
        activeSportIndex: 1,
        sports: [
          { sport: 'football', positions: ['WR'] },
          { sport: 'basketball', positions: ['PG'] },
        ],
      },
      fakeDb
    );

    expect((contextBuilder as any).buildPromptContext).toHaveBeenCalledWith(
      'user-99',
      expect.stringContaining('sport: basketball'),
      fakeDb
    );
    expect(result.sport).toBe('basketball');
    expect(result.primaryPosition).toBe('PG');
    expect(result.promptContextText).toContain('athlete-rag-context');
    expect(result.promptContextText).toContain('For basketball, this is the');
  });

  it('falls back to profile context for athlete intel when vector retrieval fails', async () => {
    const contextBuilder = {
      buildPromptContext: vi.fn().mockRejectedValue(new Error('vector unavailable')),
    } as unknown as ContextBuilder;

    const fallbackProfile = {
      userId: 'user-99',
      role: 'athlete',
      displayName: 'Fallback Athlete',
      sport: 'basketball',
      position: 'PG',
    };

    vi.spyOn(ContextBuilder.prototype, 'buildContext').mockResolvedValue(fallbackProfile as never);
    vi.spyOn(ContextBuilder.prototype, 'compressToPrompt').mockReturnValue(
      'fallback-athlete-context'
    );

    const service = new IntelGenerationService(undefined, contextBuilder);
    const result = await (service as any).buildAthletePromptContext(
      'user-99',
      {
        activeSportIndex: 1,
        sports: [
          { sport: 'football', positions: ['WR'] },
          { sport: 'basketball', positions: ['PG'] },
        ],
      },
      fakeDb
    );

    expect(result.sport).toBe('basketball');
    expect(result.primaryPosition).toBe('PG');
    expect(result.promptContextText).toContain('fallback-athlete-context');
    expect(result.promptContextText).toContain('For basketball, this is the');
  });

  it('preserves season-aware scaffolding for athlete intel prompts', () => {
    const service = new IntelGenerationService();

    const result = (service as any).buildAthleteScaffolding(
      'basketball',
      new Date('2026-12-10T12:00:00.000Z')
    );

    expect(result).toContain('For basketball, this is the In-Season period');
    expect(result).toContain('Context: Use season timing');
  });
});
