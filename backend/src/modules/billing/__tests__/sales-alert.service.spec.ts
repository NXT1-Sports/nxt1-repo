import { beforeEach, describe, expect, it, vi } from 'vitest';

const sendSlackAlertMock = vi.fn();

vi.mock('../../../services/platform/alert.service.js', () => ({
  sendSlackAlert: sendSlackAlertMock,
}));

describe('sales-alert.service', () => {
  beforeEach(() => {
    sendSlackAlertMock.mockReset();
    sendSlackAlertMock.mockResolvedValue(true);
  });

  it('formats billing alerts for the sales Slack target', async () => {
    const { sendSalesBillingAlert } = await import('../sales-alert.service.js');

    await sendSalesBillingAlert({
      environment: 'production',
      title: 'Wallet Top-Up Completed',
      summary: 'A wallet top-up completed using a saved default card.',
      amountCents: 2500,
      currency: 'usd',
      transactionId: 'pi_123',
      userId: 'user_123',
      paymentType: 'wallet_topup',
      billingEntity: 'individual',
      source: 'stripe_direct_charge',
      linkText: 'Open Receipt',
      linkUrl: 'https://stripe.test/receipt',
    });

    expect(sendSlackAlertMock).toHaveBeenCalledWith(
      expect.objectContaining({
        target: 'sales',
        environment: 'production',
        title: 'Wallet Top-Up Completed',
        linkText: 'Open Receipt',
        linkUrl: 'https://stripe.test/receipt',
      })
    );
  });

  it('formats funnel alerts for checkout events', async () => {
    const { sendSalesFunnelAlert } = await import('../sales-alert.service.js');

    await sendSalesFunnelAlert({
      environment: 'staging',
      eventName: 'begin_checkout',
      userId: 'user_123',
      billingEntity: 'organization',
      amountCents: 5000,
      organizationId: 'org_123',
      paymentMethod: 'stripe',
      checkoutType: 'hosted_checkout',
    });

    expect(sendSlackAlertMock).toHaveBeenCalledWith(
      expect.objectContaining({
        target: 'sales',
        environment: 'staging',
        title: 'Credit Checkout Started',
      })
    );
  });
});
