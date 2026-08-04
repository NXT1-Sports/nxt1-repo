/**
 * @fileoverview Centralized Outbound Marketing Email Service
 * @module @nxt1/backend/services/marketing/outbound-email
 *
 * Single backend entry point for product/marketing lifecycle emails.
 */

import { randomUUID } from 'node:crypto';
import { buildTrackedEmailHtmlWithRecipientHash } from '../../communications/connected-mail.service.js';
import { logger } from '../../../utils/logger.js';
import {
  createMarketingEmailDispatch,
  hashMarketingRecipientEmail,
  markMarketingEmailDispatchFailed,
  markMarketingEmailDispatchSent,
  readMarketingRecipientDomain,
} from './marketing-email-dispatch.service.js';
import { getMarketingEmailProvider } from './providers/provider-registry.js';
import type {
  MarketingEmailSendInput,
  MarketingEmailSendResult,
} from './providers/marketing-email-provider.types.js';

export type OutboundMarketingEmailInput = MarketingEmailSendInput;
export type OutboundMarketingEmailResult = MarketingEmailSendResult;

function isLikelyEmail(value: string): boolean {
  const trimmed = value.trim();
  return trimmed.length > 3 && trimmed.includes('@') && !trimmed.includes(' ');
}

function inferCampaignFamily(campaignKey: string): string {
  if (campaignKey.startsWith('welcome_')) return 'welcome';
  if (campaignKey.startsWith('signup_drip_')) return 'signup_drip';
  if (campaignKey.startsWith('monthly_campaign_')) return 'monthly';
  if (campaignKey.startsWith('launch_')) return 'launch';
  if (campaignKey.startsWith('b2b_')) return 'b2b';
  if (campaignKey.startsWith('legacy_')) return 'legacy';
  if (campaignKey.startsWith('usage_started_')) return 'usage_started';
  if (campaignKey.startsWith('trial_credits_')) return 'trial_credits';
  if (campaignKey.startsWith('closed_won_')) return 'closed_won';
  if (campaignKey.startsWith('post_purchase_')) return 'post_purchase';
  return 'unknown';
}

/**
 * Send one outbound marketing email through the centralized provider boundary.
 */
export async function sendOutboundMarketingEmail(
  input: OutboundMarketingEmailInput
): Promise<OutboundMarketingEmailResult> {
  const to = input.to.trim().toLowerCase();

  if (!isLikelyEmail(to)) {
    throw new Error(`Invalid recipient email: ${input.to}`);
  }

  const provider = getMarketingEmailProvider();
  const dispatchId = randomUUID();
  const trackingId = dispatchId;
  const campaignFamily = inferCampaignFamily(input.campaignKey);
  const recipientEmailHash = hashMarketingRecipientEmail(to);
  const recipientDomain = readMarketingRecipientDomain(to);
  const trackedHtml = buildTrackedEmailHtmlWithRecipientHash(input.html, {
    subjectId: `marketing:${input.campaignKey}`,
    subjectType: 'organization',
    trackingId,
    recipientEmailHash,
    recipientName: to,
    extraTrackingParams: {
      campaignKey: input.campaignKey,
      campaignFamily,
      provider: provider.key,
      dispatchId,
      emailOrigin: 'marketing',
    },
  });

  await createMarketingEmailDispatch({
    dispatchId,
    trackingId,
    campaignKey: input.campaignKey,
    campaignFamily,
    provider: provider.key,
    userId: input.userId,
    to,
    subject: input.subject,
    replyTo: input.replyTo,
    metadata: {
      emailOrigin: 'marketing',
      ...(input.metadata ?? {}),
    },
  });

  try {
    const result = await provider.send({
      ...input,
      to,
      html: trackedHtml,
      campaignFamily,
      dispatchId,
      trackingId,
      recipientEmailHash,
      recipientDomain,
    });

    await markMarketingEmailDispatchSent({
      dispatchId,
      providerMessageId: result.providerMessageId,
    });

    logger.info('[MarketingEmail] Sent outbound email', {
      campaignKey: input.campaignKey,
      campaignFamily,
      dispatchId,
      userId: input.userId,
      to,
      provider: result.provider,
      providerMessageId: result.providerMessageId,
    });

    return {
      ...result,
      dispatchId,
      trackingId,
    };
  } catch (error) {
    const failureReason = error instanceof Error ? error.message : String(error);
    await markMarketingEmailDispatchFailed({
      dispatchId,
      failureReason,
    });
    throw error;
  }
}
