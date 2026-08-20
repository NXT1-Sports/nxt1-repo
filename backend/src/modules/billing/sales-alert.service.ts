import { logger } from '../../utils/logger.js';
import { sendSlackAlert, type AlertField } from '../../services/platform/alert.service.js';

export type SalesAlertEnvironment = 'staging' | 'production';

export type SalesBillingAlertSource =
  'stripe_checkout' | 'stripe_direct_charge' | 'stripe_invoice' | 'apple_iap';

export type SalesFunnelEventName =
  'view_item' | 'view_item_list' | 'add_to_cart' | 'begin_checkout' | 'add_payment_info';

function formatCurrencyAmount(amountCents: number, currency: string | undefined): string {
  return `$${(amountCents / 100).toFixed(2)} ${(currency ?? 'usd').toUpperCase()}`;
}

export async function sendSalesBillingAlert(input: {
  readonly environment: SalesAlertEnvironment;
  readonly title: string;
  readonly summary: string;
  readonly amountCents: number;
  readonly currency?: string;
  readonly transactionId: string;
  readonly userId: string;
  readonly paymentType: string;
  readonly billingEntity: 'individual' | 'organization';
  readonly source: SalesBillingAlertSource;
  readonly organizationId?: string;
  readonly linkText?: string;
  readonly linkUrl?: string | null;
}): Promise<boolean> {
  const fields: AlertField[] = [
    { label: 'Amount', value: formatCurrencyAmount(input.amountCents, input.currency) },
    { label: 'Payment Type', value: input.paymentType },
    { label: 'Billing Entity', value: input.billingEntity },
    { label: 'Transaction ID', value: input.transactionId },
    { label: 'User ID', value: input.userId },
    { label: 'Source', value: input.source },
    { label: 'Environment', value: input.environment },
  ];

  if (input.organizationId) {
    fields.splice(5, 0, { label: 'Organization ID', value: input.organizationId });
  }

  try {
    const delivered = await sendSlackAlert({
      target: 'sales',
      environment: input.environment,
      severity: 'info',
      title: input.title,
      summary: input.summary,
      fields,
      linkText: input.linkText,
      linkUrl: input.linkUrl ?? undefined,
    });

    if (!delivered) {
      logger.warn('[billing.sales-alert] Slack delivery did not succeed', {
        transactionId: input.transactionId,
        paymentType: input.paymentType,
        environment: input.environment,
      });
    }

    return delivered;
  } catch (error) {
    logger.error('[billing.sales-alert] Failed to dispatch Slack sales alert', {
      transactionId: input.transactionId,
      paymentType: input.paymentType,
      environment: input.environment,
      error,
    });
    return false;
  }
}

function getSalesFunnelTitle(eventName: SalesFunnelEventName): string {
  switch (eventName) {
    case 'view_item':
      return 'Credit Purchase Viewed';
    case 'view_item_list':
      return 'Credit Package List Viewed';
    case 'add_to_cart':
      return 'Credits Added To Cart';
    case 'begin_checkout':
      return 'Credit Checkout Started';
    case 'add_payment_info':
      return 'Billing Payment Info Added';
  }
}

function getSalesFunnelSummary(
  eventName: SalesFunnelEventName,
  amountCents: number | undefined,
  billingEntity: 'individual' | 'organization'
): string {
  const entityLabel = billingEntity === 'organization' ? 'organization' : 'individual';
  const amountLabel =
    typeof amountCents === 'number' ? ` for $${(amountCents / 100).toFixed(2)}` : '';

  switch (eventName) {
    case 'view_item':
      return `A user viewed the wallet credit purchase flow for ${entityLabel} billing${amountLabel}.`;
    case 'view_item_list':
      return `A user viewed the wallet credit package list for ${entityLabel} billing${amountLabel}.`;
    case 'add_to_cart':
      return `A wallet credit package was added to cart for ${entityLabel} billing${amountLabel}.`;
    case 'begin_checkout':
      return `A wallet credit checkout started for ${entityLabel} billing${amountLabel}.`;
    case 'add_payment_info':
      return `Payment information was added during the wallet credit flow for ${entityLabel} billing.`;
  }
}

export async function sendSalesFunnelAlert(input: {
  readonly environment: SalesAlertEnvironment;
  readonly eventName: SalesFunnelEventName;
  readonly userId: string;
  readonly billingEntity: 'individual' | 'organization';
  readonly amountCents?: number;
  readonly currency?: string;
  readonly organizationId?: string;
  readonly checkoutType?: string;
  readonly paymentMethod?: string;
  readonly paymentType?: string;
  readonly selectionType?: string;
  readonly entryPoint?: string;
}): Promise<boolean> {
  const fields: AlertField[] = [
    { label: 'Event', value: input.eventName },
    { label: 'Billing Entity', value: input.billingEntity },
    { label: 'User ID', value: input.userId },
    { label: 'Environment', value: input.environment },
  ];

  if (typeof input.amountCents === 'number') {
    fields.splice(1, 0, {
      label: 'Amount',
      value: formatCurrencyAmount(input.amountCents, input.currency),
    });
  }

  if (input.organizationId) {
    fields.splice(2, 0, { label: 'Organization ID', value: input.organizationId });
  }

  if (input.checkoutType) {
    fields.push({ label: 'Checkout Type', value: input.checkoutType });
  }

  if (input.paymentMethod) {
    fields.push({ label: 'Payment Method', value: input.paymentMethod });
  }

  if (input.paymentType) {
    fields.push({ label: 'Payment Type', value: input.paymentType });
  }

  if (input.selectionType) {
    fields.push({ label: 'Selection Type', value: input.selectionType });
  }

  if (input.entryPoint) {
    fields.push({ label: 'Entry Point', value: input.entryPoint });
  }

  try {
    const delivered = await sendSlackAlert({
      target: 'sales',
      environment: input.environment,
      severity: 'info',
      title: getSalesFunnelTitle(input.eventName),
      summary: getSalesFunnelSummary(input.eventName, input.amountCents, input.billingEntity),
      fields,
    });

    if (!delivered) {
      logger.warn('[billing.sales-funnel] Slack delivery did not succeed', {
        eventName: input.eventName,
        userId: input.userId,
        environment: input.environment,
      });
    }

    return delivered;
  } catch (error) {
    logger.error('[billing.sales-funnel] Failed to dispatch Slack sales funnel alert', {
      eventName: input.eventName,
      userId: input.userId,
      environment: input.environment,
      error,
    });
    return false;
  }
}
