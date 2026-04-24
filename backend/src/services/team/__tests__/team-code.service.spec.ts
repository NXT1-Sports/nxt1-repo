import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../core/cache.service.js', () => ({
  getCacheService: () => null,
  CACHE_TTL: { PROFILES: 300 },
}));

vi.mock('../../../utils/logger.js', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock('../roster-entry.service.js', () => ({
  RosterEntryService: vi.fn(),
}));

import { incrementTeamPageView } from '../team-code.service.js';

describe('incrementTeamPageView', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('does not mutate Teams documents when a page view is recorded', async () => {
    const updateMock = vi.fn();
    const teamDocRef = {
      get: vi.fn().mockResolvedValue({
        exists: true,
        data: () => ({ teamCode: 'YCHQW1', unicode: 'ascension-catholic-football' }),
      }),
      update: updateMock,
    };

    const db = {
      collection: vi.fn().mockReturnValue({
        doc: vi.fn().mockReturnValue(teamDocRef),
      }),
    };

    await incrementTeamPageView(db as never, 'team-123');

    expect(updateMock).not.toHaveBeenCalled();
  });
});
