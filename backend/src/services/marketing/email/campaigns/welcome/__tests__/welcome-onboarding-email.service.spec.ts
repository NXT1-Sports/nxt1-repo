import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../outbound-email.service.js', () => ({
  sendOutboundMarketingEmail: vi.fn(),
}));

import { sendOutboundMarketingEmail } from '../../../outbound-email.service.js';
import { sendWelcomeOnboardingEmail } from '../welcome-onboarding-email.service.js';

describe('sendWelcomeOnboardingEmail', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(sendOutboundMarketingEmail).mockResolvedValue({
      provider: 'platform_smtp',
      providerMessageId: 'msg_123',
    });
  });

  it('builds the athlete welcome campaign through the centralized outbound boundary', async () => {
    const result = await sendWelcomeOnboardingEmail({
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
      campaignKey: 'welcome_intro_athlete',
    });
    expect(sendOutboundMarketingEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'athlete@example.com',
        campaignKey: 'welcome_intro_athlete',
        subject: 'Welcome to NXT1 - your athlete command center is ready',
      })
    );
  });

  it('builds the team welcome campaign for team-role users', async () => {
    const result = await sendWelcomeOnboardingEmail({
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
      campaignKey: 'welcome_intro_team',
    });
    expect(sendOutboundMarketingEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'coach@example.com',
        campaignKey: 'welcome_intro_team',
        subject: 'Welcome to NXT1 - your program command center is ready',
      })
    );
  });

  it('routes the primary welcome CTA to Agent X', async () => {
    await sendWelcomeOnboardingEmail({
      userId: 'athlete-2',
      email: 'athlete-2@example.com',
      firstName: 'Mia',
      environment: 'staging',
      role: 'athlete',
      primarySport: 'Basketball',
      marketingEnabled: true,
    });

    const payload = vi.mocked(sendOutboundMarketingEmail).mock.calls[0]?.[0];
    expect(payload?.html).toContain('/agent-x');
    expect(payload?.html).not.toContain('/home');
  });

  it('skips when marketing is disabled', async () => {
    const result = await sendWelcomeOnboardingEmail({
      userId: 'skip-1',
      email: 'skip@example.com',
      firstName: 'Skip',
      environment: 'production',
      role: 'athlete',
      marketingEnabled: false,
    });

    expect(result).toEqual({ status: 'skipped', reason: 'marketing-disabled' });
    expect(sendOutboundMarketingEmail).not.toHaveBeenCalled();
  });
});
