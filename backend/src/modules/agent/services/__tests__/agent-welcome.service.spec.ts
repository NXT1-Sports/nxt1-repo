import { beforeEach, describe, expect, it, vi } from 'vitest';

const { isEnabledMock } = vi.hoisted(() => ({
  isEnabledMock: vi.fn(),
}));

vi.mock('../../../../config/feature-flags/index.js', () => ({
  getFeatureFlagsService: vi.fn(() => ({
    isEnabled: isEnabledMock,
  })),
}));

vi.mock('../../../../utils/logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

import { enqueueWelcomeGraphicIfReady } from '../agent-welcome.service.js';

describe('enqueueWelcomeGraphicIfReady', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('skips before queue evaluation when the welcome graphics flag is disabled', async () => {
    isEnabledMock.mockResolvedValue(false);

    const result = await enqueueWelcomeGraphicIfReady({} as never, { userId: 'user-123' });

    expect(result).toEqual({ status: 'skipped', reason: 'feature_disabled' });
  });

  it('still reports queue_unavailable when the flag is enabled but the queue is not initialized', async () => {
    isEnabledMock.mockResolvedValue(true);

    const result = await enqueueWelcomeGraphicIfReady({} as never, { userId: 'user-123' });

    expect(result).toEqual({ status: 'skipped', reason: 'queue_unavailable' });
  });
});
