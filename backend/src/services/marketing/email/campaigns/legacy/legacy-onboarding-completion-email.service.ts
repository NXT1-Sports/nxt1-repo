/**
 * @fileoverview Legacy Onboarding Completion Campaign
 * @module @nxt1/backend/services/marketing/email/campaigns/legacy/legacy-onboarding-completion-email
 *
 * Sends the legacy subscription migration email when a migrated user completes
 * legacy onboarding (`legacyOnboardingCompleted: true`).
 */

import fs from 'node:fs/promises';
import { sendOutboundMarketingEmail } from '../../outbound-email.service.js';
import { logger } from '../../../../../utils/logger.js';
import { toAbsoluteAppUrl } from '../../../../../utils/app-url.js';
import type { RuntimeEnvironment } from '../../../../../config/runtime-environment.js';

const CAMPAIGN_KEY = 'legacy_subscription_migration';
const SUBJECT = 'Your NXT1 billing upgrade is complete - your account credit is ready';
const DEFAULT_FIRST_NAME = 'NXT1 Member';

const TEMPLATE_FILE_URL = new URL(
  '../../templates/legacy-subscription-migration.html',
  import.meta.url
);

let cachedTemplate: string | null = null;

interface LegacyOnboardingCompletionEmailInput {
  readonly userId: string;
  readonly email?: string | null;
  readonly firstName?: string | null;
  readonly environment: RuntimeEnvironment;
}

export type LegacyOnboardingCompletionEmailResult =
  | { readonly status: 'sent'; readonly email: string }
  | { readonly status: 'skipped'; readonly reason: 'missing-email' };

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

async function getTemplateHtml(): Promise<string> {
  if (cachedTemplate) {
    return cachedTemplate;
  }
  cachedTemplate = await fs.readFile(TEMPLATE_FILE_URL, 'utf8');
  return cachedTemplate;
}

function renderTemplate(
  template: string,
  variables: {
    firstName: string;
    walletUrl: string;
    helpCenterUrl: string;
    supportUrl: string;
  }
): string {
  return template
    .replaceAll('{{firstName}}', escapeHtml(variables.firstName))
    .replaceAll('{{walletUrl}}', variables.walletUrl)
    .replaceAll('{{helpCenterUrl}}', variables.helpCenterUrl)
    .replaceAll('{{supportUrl}}', variables.supportUrl);
}

export async function sendLegacyOnboardingCompletionEmail(
  input: LegacyOnboardingCompletionEmailInput
): Promise<LegacyOnboardingCompletionEmailResult> {
  const email = input.email?.trim().toLowerCase();
  if (!email) {
    return { status: 'skipped', reason: 'missing-email' };
  }

  const firstName = input.firstName?.trim() || DEFAULT_FIRST_NAME;

  const walletUrl = toAbsoluteAppUrl('/usage', { environment: input.environment });
  const helpCenterUrl = toAbsoluteAppUrl('/help-center', { environment: input.environment });
  const supportUrl = 'mailto:support@nxt1sports.com';

  const template = await getTemplateHtml();
  const html = renderTemplate(template, {
    firstName,
    walletUrl,
    helpCenterUrl,
    supportUrl,
  });

  try {
    await sendOutboundMarketingEmail({
      to: email,
      subject: SUBJECT,
      html,
      campaignKey: CAMPAIGN_KEY,
      userId: input.userId,
      replyTo: 'support@nxt1sports.com',
    });

    return { status: 'sent', email };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);

    logger.error('[MarketingEmail] Legacy onboarding completion email failed', {
      userId: input.userId,
      email,
      error: message,
    });

    throw err;
  }
}
