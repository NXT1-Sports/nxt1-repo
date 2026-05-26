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

import { deriveBodyFromResult, logAgentTaskCompletion } from '../agent-activity.service.js';

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

  it('uses clean generic body copy when the result only has orchestration task labels', async () => {
    await logAgentTaskCompletion({} as never, {
      userId: 'user-123',
      job: {
        operationId: 'op-123',
        sessionId: 'session-123',
        intent: 'Sync our team profile',
        userId: 'user-123',
        origin: 'user',
      } as never,
      threadTitle: 'Team Profile Account Sync',
      result: {
        data: {
          plan: {
            tasks: [
              { displayLabel: 'scrape and index profile' },
              { displayLabel: 'read distilled section' },
              { displayLabel: 'write core identity' },
            ],
          },
        },
      } as never,
    });

    expect(dispatchMock).toHaveBeenCalledWith(
      {} as never,
      expect.objectContaining({
        title: 'Team Profile Account Sync',
        body: 'Open Agent X to review it.',
      })
    );
  });

  it('uses producer-provided notification titles when the top-level result title is missing', async () => {
    await logAgentTaskCompletion({} as never, {
      userId: 'user-123',
      job: {
        operationId: 'op-123',
        sessionId: 'session-123',
        intent: 'Create a welcome graphic for me',
        userId: 'user-123',
        origin: 'database_event',
      } as never,
      result: {
        data: {
          notificationTitle: 'Your welcome graphic is ready',
          response: 'Your welcome graphic is ready in Agent X.',
        },
      } as never,
    });

    expect(dispatchMock).toHaveBeenCalledWith(
      {} as never,
      expect.objectContaining({
        title: 'Your welcome graphic is ready',
        body: 'Your welcome graphic is ready in Agent X.',
      })
    );
  });
});

describe('deriveBodyFromResult', () => {
  it('prefers result.data.response when summary is missing', () => {
    const body = deriveBodyFromResult({
      data: {
        response: 'I built your scouting report with top strengths and next steps.',
      },
    } as never);

    expect(body).toBe('I built your scouting report with top strengths and next steps.');
  });

  it('prefers coordinator observation over generic completed-steps fallback', () => {
    const body = deriveBodyFromResult({
      data: {
        toolCallRecords: [
          {
            toolName: 'create_play_diagram',
            status: 'success',
          },
          {
            toolName: 'write_playbooks',
            status: 'success',
          },
          {
            toolName: 'delegate_to_coordinator',
            status: 'success',
            output: {
              coordinator_observation:
                'I generated three route concepts and saved them into your playbook with diagram links.',
            },
          },
        ],
      },
    } as never);

    expect(body).toBe(
      'I generated three route concepts and saved them into your playbook with diagram links.'
    );
  });

  it('returns an empty string when only plan task labels are available', () => {
    const body = deriveBodyFromResult({
      data: {
        plan: {
          tasks: [
            { displayLabel: 'scrape and index profile' },
            { displayLabel: 'read distilled section' },
            { displayLabel: 'write core identity' },
          ],
        },
      },
    } as never);

    expect(body).toBe('');
  });

  it('returns an empty string when only successful tool names are available', () => {
    const body = deriveBodyFromResult({
      data: {
        toolCallRecords: [
          {
            toolName: 'enqueue_sync_profiles',
            status: 'success',
          },
          {
            toolName: 'write_core_identity',
            status: 'success',
          },
        ],
      },
    } as never);

    expect(body).toBe('');
  });
});
