import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../outbound-email.service.js', () => ({
  sendOutboundMarketingEmail: vi.fn(),
}));

import { sendOutboundMarketingEmail } from '../../../outbound-email.service.js';
import { sendTrialCreditsFinishedEmail } from '../trial-credits-finished-email.service.js';

describe('sendTrialCreditsFinishedEmail', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(sendOutboundMarketingEmail).mockResolvedValue({
      provider: 'platform_smtp',
      providerMessageId: 'msg_123',
    });
  });

  it('sends trial credits finished email to B2C individual athlete', async () => {
    const result = await sendTrialCreditsFinishedEmail({
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
      campaignKey: 'trial_credits_finished_athlete',
    });
    expect(sendOutboundMarketingEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'athlete@example.com',
        campaignKey: 'trial_credits_finished_athlete',
        subject: 'Your Trial Credits Are Complete — Top Up to Keep Building ⚡',
      })
    );
  });

  it('ENFORCES Org-Covered Athlete Guard and skips org athletes', async () => {
    const result = await sendTrialCreditsFinishedEmail({
      userId: 'org-athlete-1',
      email: 'org-athlete@example.com',
      firstName: 'Mia',
      environment: 'production',
      role: 'athlete',
      organizationId: 'org-123',
      paymentState: 'org-covered',
      marketingEnabled: true,
    });

    expect(result).toEqual({
      status: 'skipped',
      reason: 'org-covered-athlete',
    });
    expect(sendOutboundMarketingEmail).not.toHaveBeenCalled();
  });

  it('sends program trial finished email to head coach / admin', async () => {
    const result = await sendTrialCreditsFinishedEmail({
      userId: 'coach-1',
      email: 'coach@example.com',
      firstName: 'Jordan',
      environment: 'production',
      role: 'coach',
      organizationName: 'Alcoa Football',
      organizationId: 'org-123',
      paymentState: 'unpaid',
      marketingEnabled: true,
    });

    expect(result).toEqual({
      status: 'sent',
      email: 'coach@example.com',
      campaignKey: 'trial_credits_finished_team',
    });
    expect(sendOutboundMarketingEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'coach@example.com',
        campaignKey: 'trial_credits_finished_team',
        subject: "Program Trial Complete — Lock In Alcoa Football's Staff Access 🏆",
      })
    );
  });
});
