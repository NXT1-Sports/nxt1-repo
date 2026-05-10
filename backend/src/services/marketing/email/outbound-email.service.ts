/**
 * @fileoverview Centralized Outbound Marketing Email Service
 * @module @nxt1/backend/services/marketing/outbound-email
 *
 * Single backend entry point for product/marketing lifecycle emails.
 */

import { logger } from '../../../utils/logger.js';
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
  const result = await provider.send({
    ...input,
    to,
  });

  logger.info('[MarketingEmail] Sent outbound email', {
    campaignKey: input.campaignKey,
    userId: input.userId,
    to,
    provider: result.provider,
    providerMessageId: result.providerMessageId,
  });

  return result;
}
