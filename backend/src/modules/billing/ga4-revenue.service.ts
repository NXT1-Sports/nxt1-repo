/**
 * @fileoverview GA4 revenue event sender for billing finalization
 * @module @nxt1/backend/modules/billing
 */

import { FIREBASE_EVENTS, type PurchaseEventParams } from '@nxt1/core/analytics';
import { logger } from '../../utils/logger.js';

export interface BillingRevenueEventInput {
  readonly userId: string;
  readonly transactionId: string;
  readonly valueCents: number;
  readonly currency?: string;
  readonly itemId: string;
  readonly itemName: string;
  readonly itemCategory: string;
  readonly billingEntity: 'individual' | 'organization';
  readonly source: 'stripe_checkout' | 'stripe_direct_charge' | 'apple_iap' | 'auto_topup';
}

const GA4_MEASUREMENT_ID = process.env['GA4_MEASUREMENT_ID'];
const GA4_API_SECRET = process.env['GA4_API_SECRET'];

let missingConfigLogged = false;

function toUpperCurrency(currency: string | undefined): string {
  return (currency ?? 'usd').trim().toUpperCase();
}

export async function trackBillingPurchaseEvent(input: BillingRevenueEventInput): Promise<void> {
  if (!GA4_MEASUREMENT_ID || !GA4_API_SECRET) {
    if (!missingConfigLogged) {
      missingConfigLogged = true;
      logger.info('[ga4-revenue] Skipping billing purchase event because GA4 is not configured');
    }
    return;
  }

  if (!Number.isFinite(input.valueCents) || input.valueCents <= 0) {
    logger.warn('[ga4-revenue] Skipping billing purchase event with invalid amount', {
      transactionId: input.transactionId,
      userId: input.userId,
      valueCents: input.valueCents,
    });
    return;
  }

  const value = Number((input.valueCents / 100).toFixed(2));
  const params: PurchaseEventParams & {
    readonly event_id: string;
    readonly engagement_time_msec: number;
    readonly item_category: string;
    readonly billing_entity: 'individual' | 'organization';
    readonly source: string;
  } = {
    transaction_id: input.transactionId,
    value,
    currency: toUpperCurrency(input.currency),
    event_id: input.transactionId,
    engagement_time_msec: 1,
    items: [
      {
        item_id: input.itemId,
        item_name: input.itemName,
        item_category: input.itemCategory,
        price: value,
        quantity: 1,
      },
    ],
    item_category: input.itemCategory,
    billing_entity: input.billingEntity,
    source: input.source,
  };

  const endpoint = new URL('https://www.google-analytics.com/mp/collect');
  endpoint.searchParams.set('measurement_id', GA4_MEASUREMENT_ID);
  endpoint.searchParams.set('api_secret', GA4_API_SECRET);

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        client_id: `nxt1:${input.userId}`,
        user_id: input.userId,
        events: [
          {
            name: FIREBASE_EVENTS.PURCHASE,
            params,
          },
        ],
      }),
    });

    if (!response.ok) {
      logger.warn('[ga4-revenue] GA4 rejected billing purchase event', {
        transactionId: input.transactionId,
        userId: input.userId,
        status: response.status,
      });
    }
  } catch (error) {
    logger.warn('[ga4-revenue] Failed to send billing purchase event', {
      transactionId: input.transactionId,
      userId: input.userId,
      error,
    });
  }
}
