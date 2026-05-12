import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('trackBillingPurchaseEvent', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('skips when GA4 is not configured', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);

    const { trackBillingPurchaseEvent } = await import('../ga4-revenue.service.js');

    await trackBillingPurchaseEvent({
      userId: 'user_123',
      transactionId: 'txn_123',
      valueCents: 500,
      itemId: 'wallet_topup_500',
      itemName: 'NXT1 Wallet Top-Up',
      itemCategory: 'wallet_topup',
      billingEntity: 'individual',
      source: 'stripe_checkout',
    });

    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('sends a GA4 purchase event with the checkout payload', async () => {
    vi.stubEnv('GA4_MEASUREMENT_ID', 'G-TEST123');
    vi.stubEnv('GA4_API_SECRET', 'secret_123');

    const fetchSpy = vi.fn().mockResolvedValue({ ok: true, status: 204 });
    vi.stubGlobal('fetch', fetchSpy);

    const { trackBillingPurchaseEvent } = await import('../ga4-revenue.service.js');

    await trackBillingPurchaseEvent({
      userId: 'user_123',
      transactionId: 'txn_123',
      valueCents: 2500,
      itemId: 'wallet_topup_2500',
      itemName: 'NXT1 Wallet Top-Up',
      itemCategory: 'wallet_topup',
      billingEntity: 'individual',
      source: 'stripe_checkout',
    });

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0] ?? [];
    expect(String(url)).toContain('https://www.google-analytics.com/mp/collect');
    expect(String(url)).toContain('measurement_id=G-TEST123');
    expect(String(url)).toContain('api_secret=secret_123');
    expect(init).toMatchObject({ method: 'POST' });

    const body = JSON.parse((init as { body: string }).body) as {
      client_id: string;
      user_id: string;
      events: Array<{ name: string; params: Record<string, unknown> }>;
    };

    expect(body.client_id).toBe('nxt1:user_123');
    expect(body.user_id).toBe('user_123');
    expect(body.events[0]?.name).toBe('purchase');
    expect(body.events[0]?.params).toMatchObject({
      transaction_id: 'txn_123',
      value: 25,
      currency: 'USD',
      event_id: 'txn_123',
      billing_entity: 'individual',
      source: 'stripe_checkout',
    });
  });
});
