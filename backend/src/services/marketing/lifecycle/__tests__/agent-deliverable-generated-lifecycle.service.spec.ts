import { afterEach, describe, expect, it, vi } from 'vitest';

const mockSendSlackAlert = vi.fn();

vi.mock('../../../platform/alert.service.js', () => ({
  sendSlackAlert: mockSendSlackAlert,
}));

function createDbStub(userData: Record<string, unknown> | null) {
  return {
    collection(name: string) {
      if (name !== 'Users') {
        throw new Error(`Unexpected collection: ${name}`);
      }

      return {
        doc(userId: string) {
          return {
            async get() {
              return {
                id: userId,
                exists: userData !== null,
                data: () => userData,
              };
            },
          };
        },
      };
    },
  };
}

describe('processAgentDeliverableGeneratedLifecycle', () => {
  afterEach(() => {
    vi.clearAllMocks();
    delete process.env['APP_URL'];
    delete process.env['PRODUCTION_APP_URL'];
  });

  it('includes the canonical unicode profile URL in the marketing Slack payload', async () => {
    process.env['PRODUCTION_APP_URL'] = 'https://nxt1sports.com';
    mockSendSlackAlert.mockResolvedValue(true);

    const { processAgentDeliverableGeneratedLifecycle } =
      await import('../agent-deliverable-generated-lifecycle.service.js');

    await processAgentDeliverableGeneratedLifecycle({
      db: createDbStub({
        firstName: 'Sophia',
        lastName: 'Green',
        sports: [{ sport: 'Softball' }],
        activeSportIndex: 0,
        unicode: '40545172',
      }) as never,
      environment: 'production',
      operationId: 'chat-op-1',
      userId: 'user-1',
      deliverables: [
        {
          url: 'https://cdn.nxt1sports.com/output.png',
          name: 'final-graphic.png',
          type: 'image',
        },
      ],
    });

    expect(mockSendSlackAlert).toHaveBeenCalledWith(
      expect.objectContaining({
        target: 'marketing',
        fields: expect.arrayContaining([
          expect.objectContaining({ label: 'User ID', value: 'user-1' }),
          expect.objectContaining({
            label: 'Profile',
            value:
              '<https://nxt1sports.com/profile/softball/sophia-green/40545172|Open User Profile>',
          }),
        ]),
      })
    );
  });
});
