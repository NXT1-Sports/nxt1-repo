import { beforeEach, describe, expect, it, vi } from 'vitest';

const { createMock, updateManyMock } = vi.hoisted(() => ({
  createMock: vi.fn(),
  updateManyMock: vi.fn(),
}));

vi.mock('../../../../config/runtime-environment.js', () => ({
  getRuntimeEnvironment: vi.fn(() => 'production'),
}));

vi.mock('../../../../models/marketing/marketing-email-dispatch.model.js', () => ({
  MarketingEmailDispatchModel: {
    create: createMock,
    updateMany: updateManyMock,
  },
}));

import { createMarketingEmailDispatch } from '../marketing-email-dispatch.service.js';

describe('createMarketingEmailDispatch', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    createMock.mockResolvedValue(undefined);
    updateManyMock.mockResolvedValue({ acknowledged: true, modifiedCount: 1 });
  });

  it('recycles stale anonymous attempted dispatches and retries on duplicate key', async () => {
    const duplicateError = Object.assign(
      new Error(
        'E11000 duplicate key error collection: nxt_production.marketingEmailDispatches index: environment_1_campaignKey_1_userId_1 dup key'
      ),
      { code: 11000 }
    );

    createMock.mockRejectedValueOnce(duplicateError).mockResolvedValueOnce(undefined);

    await createMarketingEmailDispatch({
      dispatchId: 'dispatch-1',
      trackingId: 'dispatch-1',
      campaignKey: 'b2b_partner_program_invite_initial',
      campaignFamily: 'b2b',
      provider: 'platform_smtp',
      to: 'coach@example.org',
      subject: 'Hello',
    });

    expect(updateManyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        environment: 'production',
        campaignKey: 'b2b_partner_program_invite_initial',
        userId: null,
        sendStatus: 'attempted',
      }),
      expect.objectContaining({
        $set: expect.objectContaining({
          sendStatus: 'failed',
          failureReason:
            'Superseded stale attempted dispatch for a recipient-scoped marketing send.',
        }),
      })
    );
    expect(createMock).toHaveBeenCalledTimes(2);
  });

  it('does not recycle user-scoped dispatches on duplicate key', async () => {
    const duplicateError = Object.assign(
      new Error(
        'E11000 duplicate key error collection: nxt_production.marketingEmailDispatches index: environment_1_campaignKey_1_userId_1 dup key'
      ),
      { code: 11000 }
    );

    createMock.mockRejectedValueOnce(duplicateError);

    await expect(
      createMarketingEmailDispatch({
        dispatchId: 'dispatch-2',
        trackingId: 'dispatch-2',
        campaignKey: 'welcome_intro_athlete',
        campaignFamily: 'welcome',
        provider: 'brevo',
        userId: 'user-1',
        to: 'user@example.org',
        subject: 'Hello',
      })
    ).rejects.toThrow('E11000 duplicate key error');

    expect(updateManyMock).not.toHaveBeenCalled();
    expect(createMock).toHaveBeenCalledTimes(1);
  });
});
