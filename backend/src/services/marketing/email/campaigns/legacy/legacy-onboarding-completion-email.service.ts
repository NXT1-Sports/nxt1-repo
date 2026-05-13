/**
 * @fileoverview Legacy Onboarding Completion Campaign
 * @module @nxt1/backend/services/marketing/email/campaigns/legacy/legacy-onboarding-completion-email
 *
 * Sends the legacy subscription migration email when a migrated user completes
 * legacy onboarding (`legacyOnboardingCompleted: true`).
 */

import { sendOutboundMarketingEmail } from '../../outbound-email.service.js';
import { logger } from '../../../../../utils/logger.js';
import { toAbsoluteAppUrl } from '../../../../../utils/app-url.js';
import type { RuntimeEnvironment } from '../../../../../config/runtime-environment.js';
import { buildMarketingEmailShell } from '../../templates/marketing-email-shell.js';

const CAMPAIGN_KEY = 'legacy_subscription_migration';
const SUBJECT = 'Your NXT1 billing upgrade is complete - your account credit is ready';
const DEFAULT_FIRST_NAME = 'NXT1 Member';

interface LegacyOnboardingCompletionEmailInput {
  readonly userId: string;
  readonly email?: string | null;
  readonly firstName?: string | null;
  readonly environment: RuntimeEnvironment;
}

export type LegacyOnboardingCompletionEmailResult =
  | { readonly status: 'sent'; readonly email: string }
  | { readonly status: 'skipped'; readonly reason: 'missing-email' };

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

  const html = buildMarketingEmailShell({
    preheader: 'Your billing upgrade is complete and your wallet credit is ready.',
    eyebrow: 'Legacy Billing Migration',
    title: 'Welcome to the New Sports Intelligence Platform',
    subtitle: 'Your subscription has been upgraded',
    introHtml: `
      <p style="margin:0 0 16px 0;font-size:20px;line-height:1.5;color:#101722;">Hi ${firstName},</p>
      <p style="margin:0 0 20px 0;font-size:19px;line-height:1.65;color:#1f2937;">
        We've successfully transitioned your NXT1 account to our new
        <span style="background-color:#eaf7c5;color:#1f3b08;padding:2px 8px;border-radius:4px;">usage-based billing model</span>.
        You now have more flexibility and only pay for what you actually use.
      </p>
    `,
    sectionsHtml: [
      `
        <h2 style="margin:0 0 10px 0;font-size:36px;line-height:1.2;color:#0f4f1f;font-weight:800;">Your Wallet Credit</h2>
        <p style="margin:0 0 12px 0;font-size:18px;line-height:1.65;color:#1f2937;">
          As a valued subscriber, we've credited your account as part of your migration.
          Your credit is ready to use immediately.
        </p>
        <p style="margin:0 0 20px 0;font-size:18px;line-height:1.65;color:#1f2937;">
          <strong>Your credit is automatically deducted from usage</strong> as you use AI features,
          generate content, and run analysis tools. You can view your exact balance anytime in your
          <a href="${walletUrl}" style="color:#0f5a20;font-weight:700;text-decoration:underline;">wallet</a>.
        </p>
      `,
      `
        <h2 style="margin:0 0 12px 0;font-size:30px;line-height:1.2;color:#111827;font-weight:800;">What This Means for You</h2>
        <ul style="margin:0 0 16px 22px;padding:0;color:#1f2937;">
          <li style="margin:0 0 10px 0;font-size:18px;line-height:1.55;"><strong>No auto-renewing subscriptions</strong> - full control</li>
          <li style="margin:0 0 10px 0;font-size:18px;line-height:1.55;"><strong>Pay as you go</strong> - only charged when you use a feature</li>
          <li style="margin:0 0 10px 0;font-size:18px;line-height:1.55;"><strong>Flexible usage</strong> - high one week, low the next</li>
          <li style="margin:0;font-size:18px;line-height:1.55;"><strong>Better value</strong> - no wasted subscription time</li>
        </ul>
      `,
      `
        <h2 style="margin:0 0 10px 0;font-size:30px;line-height:1.2;color:#111827;font-weight:800;">How Your Wallet Works</h2>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;margin-bottom:10px;">
          <tr>
            <td style="background-color:#f3f7fb;border:1px solid #d8e3ef;border-radius:8px;padding:14px;">
              <p style="margin:0;font-size:17px;line-height:1.55;color:#1f2937;"><strong>When are credits deducted?</strong><br />Every time you use an AI feature, a small amount is deducted in real-time.</p>
            </td>
          </tr>
        </table>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;margin-bottom:10px;">
          <tr>
            <td style="background-color:#f3f7fb;border:1px solid #d8e3ef;border-radius:8px;padding:14px;">
              <p style="margin:0;font-size:17px;line-height:1.55;color:#1f2937;"><strong>What if my balance is low?</strong><br />You'll get notified, and you can top up instantly. Auto-topup is available too.</p>
            </td>
          </tr>
        </table>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;margin-bottom:12px;">
          <tr>
            <td style="background-color:#f3f7fb;border:1px solid #d8e3ef;border-radius:8px;padding:14px;">
              <p style="margin:0;font-size:17px;line-height:1.55;color:#1f2937;"><strong>Can I use features with a $0 balance?</strong><br />You need to top up first, but we notify you ahead of time.</p>
            </td>
          </tr>
        </table>
      `,
      `
        <h2 style="margin:0 0 12px 0;font-size:30px;line-height:1.2;color:#111827;font-weight:800;">Have Questions?</h2>
        <p style="margin:0 0 10px 0;font-size:18px;line-height:1.55;color:#1f2937;">Check out our help center or reach out:</p>
        <ul style="margin:0 0 6px 22px;padding:0;color:#1f2937;">
          <li style="margin:0 0 8px 0;font-size:18px;line-height:1.55;"><a href="${helpCenterUrl}" style="color:#0f5a20;font-weight:700;text-decoration:underline;">Wallet &amp; Billing FAQ</a></li>
          <li style="margin:0;font-size:18px;line-height:1.55;"><a href="${supportUrl}" style="color:#0f5a20;font-weight:700;text-decoration:underline;">Contact Support</a></li>
        </ul>
      `,
      `
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;">
          <tr>
            <td style="background-color:#edf8cf;border:1px solid #cfe89b;border-left:4px solid #91c11f;border-radius:8px;padding:14px;">
              <p style="margin:0;font-size:16px;line-height:1.55;color:#25320d;"><strong>Pro Tip:</strong> Enable auto-topup in wallet settings so your balance never runs out.</p>
            </td>
          </tr>
        </table>
      `,
    ],
    ctaButtons: [
      {
        label: 'View Your Wallet',
        href: walletUrl,
      },
    ],
    footerHtml: `
      <p style="margin:0;font-size:13px;line-height:1.5;color:#b7c5d5;">© 2026 NXT1 Sports. All rights reserved.</p>
      <p style="margin:8px 0 0 0;font-size:12px;line-height:1.5;color:#8ea0b4;">You are receiving this email because your account was migrated to our new billing model.</p>
    `,
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
