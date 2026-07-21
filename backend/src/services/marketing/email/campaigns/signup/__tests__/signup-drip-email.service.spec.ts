import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../outbound-email.service.js', () => ({
  sendOutboundMarketingEmail: vi.fn(),
}));

import { sendOutboundMarketingEmail } from '../../../outbound-email.service.js';
import { sendSignupDripEmail } from '../signup-drip-email.service.js';

describe('sendSignupDripEmail', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(sendOutboundMarketingEmail).mockResolvedValue({
      provider: 'platform_smtp',
      providerMessageId: 'msg_signup_drip',
    });
  });

  it('builds the athlete setup variant with the centralized outbound email boundary', async () => {
    const result = await sendSignupDripEmail({
      userId: 'athlete-1',
      email: 'athlete@example.com',
      firstName: 'Ava',
      environment: 'staging',
      role: 'athlete',
      stepKey: 'profile_setup',
      paymentState: 'unpaid',
      primarySport: 'Basketball',
      marketingEnabled: true,
      setupFocusAreas: ['Add your headshot.', 'Connect your film links.'],
    });

    expect(result).toEqual({
      status: 'sent',
      email: 'athlete@example.com',
      campaignKey: 'signup_drip_profile_setup_athlete',
    });
    expect(sendOutboundMarketingEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'athlete@example.com',
        campaignKey: 'signup_drip_profile_setup_athlete',
        subject: 'Complete your NXT1 profile so NXT1 can work harder',
      })
    );
  });

  it('builds the paid team reengagement variant for team-role users', async () => {
    const result = await sendSignupDripEmail({
      userId: 'coach-1',
      email: 'coach@example.com',
      firstName: 'Jordan',
      environment: 'production',
      role: 'coach',
      stepKey: 'reengagement',
      paymentState: 'org-covered',
      primarySport: 'Football',
      organizationName: 'Alcoa Football',
      marketingEnabled: true,
    });

    expect(result).toEqual({
      status: 'sent',
      email: 'coach@example.com',
      campaignKey: 'signup_drip_reengagement_paid_team',
    });
    expect(sendOutboundMarketingEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'coach@example.com',
        campaignKey: 'signup_drip_reengagement_paid_team',
        subject: 'You are set up. Now make NXT1 part of your staff workflow',
      })
    );
  });

  it('routes the primary CTA to Agent X for signup drip emails', async () => {
    await sendSignupDripEmail({
      userId: 'athlete-2',
      email: 'athlete-2@example.com',
      firstName: 'Mia',
      environment: 'staging',
      role: 'athlete',
      stepKey: 'profile_setup',
      paymentState: 'unpaid',
      primarySport: 'Basketball',
      marketingEnabled: true,
    });

    const payload = vi.mocked(sendOutboundMarketingEmail).mock.calls[0]?.[0];
    expect(payload?.html).toContain('/agent-x');
    expect(payload?.html).not.toContain('/home');
  });

  it('skips when marketing is disabled', async () => {
    const result = await sendSignupDripEmail({
      userId: 'skip-1',
      email: 'skip@example.com',
      firstName: 'Skip',
      environment: 'production',
      role: 'athlete',
      stepKey: 'agent_activation',
      paymentState: 'unpaid',
      marketingEnabled: false,
    });

    expect(result).toEqual({ status: 'skipped', reason: 'marketing-disabled' });
    expect(sendOutboundMarketingEmail).not.toHaveBeenCalled();
  });
});
