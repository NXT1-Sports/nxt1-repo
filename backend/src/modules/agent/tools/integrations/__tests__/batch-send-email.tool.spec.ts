import type { Firestore } from 'firebase-admin/firestore';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  sendEmailViaProvider: vi.fn(),
  safeTrack: vi.fn(),
}));

vi.mock('../../../../../services/communications/connected-mail.service.js', () => ({
  sendEmailViaProvider: mocks.sendEmailViaProvider,
}));

vi.mock('../../../../../services/core/analytics-logger.service.js', () => ({
  getAnalyticsLoggerService: () => ({
    safeTrack: mocks.safeTrack,
  }),
}));

import { BatchSendEmailTool } from '../email/batch-send-email.tool.js';

function createDb(provider: 'gmail' | 'microsoft' = 'gmail'): Firestore {
  return {
    collection: vi.fn(() => ({
      doc: vi.fn(() => ({
        get: vi.fn().mockResolvedValue({
          data: () => ({
            connectedEmails: [{ provider, isActive: true }],
          }),
        }),
      })),
    })),
  } as unknown as Firestore;
}

describe('batch-send-email.tool', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders recipient variables and emits progress for a successful campaign', async () => {
    mocks.sendEmailViaProvider.mockResolvedValue({
      success: true,
      externalMessageId: 'message-1',
      externalThreadId: 'thread-1',
      trackingId: 'tracking-1',
    });

    const emitStage = vi.fn();
    const tool = new BatchSendEmailTool(createDb('gmail'));

    const result = await tool.execute(
      {
        userId: 'user-1',
        recipients: [
          {
            toEmail: 'coach@osu.edu',
            variables: {
              firstName: 'Ryan',
              collegeName: 'Ohio State',
            },
          },
        ],
        subjectTemplate: 'Hi {{firstName}}',
        bodyHtmlTemplate: '<p>{{collegeName}}</p>',
      },
      {
        userId: 'user-1',
        emitStage,
      }
    );

    expect(result.success).toBe(true);
    expect(mocks.sendEmailViaProvider).toHaveBeenCalledWith(
      'user-1',
      'gmail',
      'coach@osu.edu',
      'Hi Ryan',
      '<p>Ohio State</p>',
      expect.anything()
    );
    expect(mocks.safeTrack).toHaveBeenCalledTimes(1);
    expect(emitStage).toHaveBeenCalledWith(
      'submitting_job',
      expect.objectContaining({
        phase: 'send_email',
        progress: '1/1',
      })
    );
  });

  it('rejects campaigns with unresolved placeholders before sending', async () => {
    const tool = new BatchSendEmailTool(createDb('gmail'));

    const result = await tool.execute(
      {
        userId: 'user-1',
        recipients: ['coach@osu.edu'],
        subjectTemplate: 'Hi {{firstName}}',
        bodyHtmlTemplate: '<p>Welcome</p>',
      },
      {
        userId: 'user-1',
      }
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain('missing template variables');
    expect(mocks.sendEmailViaProvider).not.toHaveBeenCalled();
  });
});
