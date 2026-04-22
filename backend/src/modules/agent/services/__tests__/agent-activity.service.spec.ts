import { beforeEach, describe, expect, it, vi } from 'vitest';

const { dispatchMock } = vi.hoisted(() => ({
  dispatchMock: vi.fn(),
}));

vi.mock('../../../../services/communications/notification.service.js', () => ({
  dispatch: dispatchMock,
}));

vi.mock('../../../../utils/logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

import { logAgentTaskCompletion } from '../agent-activity.service.js';

describe('logAgentTaskCompletion', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dispatchMock.mockResolvedValue({
      activityId: 'activity-123',
      notificationId: 'notification-123',
    });
  });

  it('uses the dedicated AI title instead of deriving one from the summary', async () => {
    await logAgentTaskCompletion({} as never, {
      userId: 'user-123',
      job: {
        operationId: 'op-123',
        sessionId: 'session-123',
        intent: 'Build my recruiting outreach plan',
        userId: 'user-123',
        origin: 'user',
      } as never,
      result: {
        title: 'Built Your Spring Recruiting Outreach Plan',
        summary:
          'I built your spring recruiting outreach plan. It includes a school list, messaging cadence, and follow-up timing.',
      },
    });

    expect(dispatchMock).toHaveBeenCalledWith(
      {} as never,
      expect.objectContaining({
        title: 'Built Your Spring Recruiting Outreach Plan',
        body: 'I built your spring recruiting outreach plan. It includes a school list, messaging cadence, and follow-up timing.',
      })
    );
  });

  it('falls back to a generic title when the operation title is missing', async () => {
    await logAgentTaskCompletion({} as never, {
      userId: 'user-123',
      job: {
        operationId: 'op-123',
        sessionId: 'session-123',
        intent: 'Build my recruiting outreach plan',
        userId: 'user-123',
        origin: 'user',
      } as never,
      result: {
        summary: 'Completed your recruiting outreach plan.',
      },
    });

    expect(dispatchMock).toHaveBeenCalledWith(
      {} as never,
      expect.objectContaining({
        title: 'Agent X Update',
      })
    );
  });
});
