import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../outbound-email.service.js', () => ({
  sendOutboundMarketingEmail: vi.fn(),
}));

import { sendOutboundMarketingEmail } from '../../../outbound-email.service.js';
import { sendUsageStartedEmail } from '../usage-started-email.service.js';

describe('sendUsageStartedEmail', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(sendOutboundMarketingEmail).mockResolvedValue({
      provider: 'platform_smtp',
      providerMessageId: 'msg_123',
    });
  });

  it('sends athlete usage started email when marketing is enabled', async () => {
    const result = await sendUsageStartedEmail({
      userId: 'athlete-1',
      email: 'athlete@example.com',
      firstName: 'Ava',
      environment: 'staging',
      role: 'athlete',
      primarySport: 'Basketball',
      marketingEnabled: true,
    });

    expect(result).toEqual({
      status: 'sent',
      email: 'athlete@example.com',
      campaignKey: 'usage_started_athlete',
    });
    expect(sendOutboundMarketingEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'athlete@example.com',
        campaignKey: 'usage_started_athlete',
        subject: "First Deliverable Complete! Here's What Agent X Can Do Next 🚀",
      })
    );
  });

  it('sends team usage started email for coach role', async () => {
    const result = await sendUsageStartedEmail({
      userId: 'coach-1',
      email: 'coach@example.com',
      firstName: 'Jordan',
      environment: 'production',
      role: 'coach',
      primarySport: 'Football',
      organizationName: 'Alcoa Football',
      marketingEnabled: true,
    });

    expect(result).toEqual({
      status: 'sent',
      email: 'coach@example.com',
      campaignKey: 'usage_started_team',
    });
    expect(sendOutboundMarketingEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'coach@example.com',
        campaignKey: 'usage_started_team',
        subject: "First Program Deliverable Complete! Here's What Agent X Can Do Next 🚀",
      })
    );
  });

  it('skips email when marketing is disabled', async () => {
    const result = await sendUsageStartedEmail({
      userId: 'user-1',
      email: 'user@example.com',
      environment: 'production',
      role: 'athlete',
      marketingEnabled: false,
    });

    expect(result).toEqual({
      status: 'skipped',
      reason: 'marketing-disabled',
    });
    expect(sendOutboundMarketingEmail).not.toHaveBeenCalled();
  });
});
