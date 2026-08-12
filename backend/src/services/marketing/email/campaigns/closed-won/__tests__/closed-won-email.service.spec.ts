import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../outbound-email.service.js', () => ({
  sendOutboundMarketingEmail: vi.fn(),
}));

import { sendOutboundMarketingEmail } from '../../../outbound-email.service.js';
import {
  sendB2CClosedWonEmail,
  sendB2BClosedWonAdminEmail,
  sendB2BClosedWonStaffEmail,
  sendB2BClosedWonAthleteBroadcastEmail,
} from '../closed-won-email.service.js';

describe('Closed Won Email Campaigns', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(sendOutboundMarketingEmail).mockResolvedValue({
      provider: 'platform_smtp',
      providerMessageId: 'msg_123',
    });
  });

  it('sends B2C Stripe closed won confirmation email', async () => {
    const result = await sendB2CClosedWonEmail({
      userId: 'user-1',
      email: 'user@example.com',
      firstName: 'Ava',
      environment: 'staging',
      paymentSource: 'stripe_checkout',
      amountFormatted: '$10.00',
      creditsAddedFormatted: '1,000 Credits',
    });

    expect(result).toEqual({
      status: 'sent',
      email: 'user@example.com',
      campaignKey: 'closed_won_b2c_stripe',
    });
    expect(sendOutboundMarketingEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'user@example.com',
        campaignKey: 'closed_won_b2c_stripe',
        subject: 'Payment Confirmed: Your NXT1 Wallet Credits are Active! 🎉',
      })
    );
  });

  it('sends B2C Apple IAP closed won confirmation email', async () => {
    const result = await sendB2CClosedWonEmail({
      userId: 'user-2',
      email: 'user2@example.com',
      firstName: 'Mia',
      environment: 'production',
      paymentSource: 'iap_topup',
      amountFormatted: '$5.00',
    });

    expect(result).toEqual({
      status: 'sent',
      email: 'user2@example.com',
      campaignKey: 'closed_won_b2c_iap',
    });
    expect(sendOutboundMarketingEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'user2@example.com',
        campaignKey: 'closed_won_b2c_iap',
      })
    );
  });

  it('sends B2B Program Admin closed won receipt email', async () => {
    const result = await sendB2BClosedWonAdminEmail({
      userId: 'admin-1',
      email: 'admin@example.com',
      firstName: 'Jordan',
      organizationName: 'Alcoa High School',
      amountFormatted: '$2,500.00',
      environment: 'production',
    });

    expect(result).toEqual({
      status: 'sent',
      email: 'admin@example.com',
      campaignKey: 'closed_won_b2b_admin',
    });
    expect(sendOutboundMarketingEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'admin@example.com',
        campaignKey: 'closed_won_b2b_admin',
        subject: 'Welcome to NXT1: Alcoa High School is Live! 🏆',
      })
    );
  });

  it('sends B2B Staff upgrade notification email', async () => {
    const result = await sendB2BClosedWonStaffEmail({
      userId: 'staff-1',
      email: 'staff@example.com',
      firstName: 'Coach Dave',
      organizationName: 'Alcoa High School',
      environment: 'production',
    });

    expect(result).toEqual({
      status: 'sent',
      email: 'staff@example.com',
      campaignKey: 'closed_won_b2b_staff',
    });
  });

  it('sends B2B Athlete broadcast email when program plan unlocks', async () => {
    const result = await sendB2BClosedWonAthleteBroadcastEmail({
      userId: 'athlete-1',
      email: 'athlete@example.com',
      firstName: 'Sam',
      organizationName: 'Alcoa High School',
      environment: 'production',
    });

    expect(result).toEqual({
      status: 'sent',
      email: 'athlete@example.com',
      campaignKey: 'closed_won_b2b_athlete_broadcast',
    });
  });
});
