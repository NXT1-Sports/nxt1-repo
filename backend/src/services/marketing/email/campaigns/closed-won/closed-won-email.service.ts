/**
 * @fileoverview Closed Won Payment Campaign Email Service
 * @module @nxt1/backend/services/marketing/email/campaigns/closed-won/closed-won-email
 *
 * Sends payment confirmation and onboarding emails when a user or program purchases NXT1.
 * Supports B2C (Stripe & Apple Pay / IAP) and B2B (Org Admin, Staff Broadcast, and Athlete Broadcast).
 */

import { sendOutboundMarketingEmail } from '../../outbound-email.service.js';
import { logger } from '../../../../../utils/logger.js';
import { toAbsoluteAppUrl } from '../../../../../utils/app-url.js';
import type { RuntimeEnvironment } from '../../../../../config/runtime-environment.js';
import { buildMarketingEmailShell } from '../../templates/marketing-email-shell.js';

const B2C_STRIPE_CAMPAIGN_KEY = 'closed_won_b2c_stripe';
const B2C_IAP_CAMPAIGN_KEY = 'closed_won_b2c_iap';
const B2B_ADMIN_CAMPAIGN_KEY = 'closed_won_b2b_admin';
const B2B_STAFF_CAMPAIGN_KEY = 'closed_won_b2b_staff';
const B2B_ATHLETE_BROADCAST_CAMPAIGN_KEY = 'closed_won_b2b_athlete_broadcast';

const DEFAULT_FIRST_NAME = 'NXT1 Member';

export interface B2CClosedWonEmailInput {
  readonly userId: string;
  readonly email?: string | null;
  readonly firstName?: string | null;
  readonly environment: RuntimeEnvironment;
  readonly paymentSource?: 'stripe_checkout' | 'iap_topup' | 'apple_pay' | string | null;
  readonly amountFormatted?: string | null;
  readonly creditsAddedFormatted?: string | null;
  readonly marketingEnabled?: boolean;
}

export interface B2BClosedWonAdminEmailInput {
  readonly userId: string;
  readonly email?: string | null;
  readonly firstName?: string | null;
  readonly organizationName?: string | null;
  readonly amountFormatted?: string | null;
  readonly environment: RuntimeEnvironment;
  readonly marketingEnabled?: boolean;
}

export interface B2BClosedWonStaffEmailInput {
  readonly userId: string;
  readonly email?: string | null;
  readonly firstName?: string | null;
  readonly organizationName?: string | null;
  readonly environment: RuntimeEnvironment;
  readonly marketingEnabled?: boolean;
}

export interface B2BClosedWonAthleteEmailInput {
  readonly userId: string;
  readonly email?: string | null;
  readonly firstName?: string | null;
  readonly organizationName?: string | null;
  readonly environment: RuntimeEnvironment;
  readonly marketingEnabled?: boolean;
}

export type ClosedWonEmailResult =
  | {
      readonly status: 'sent';
      readonly email: string;
      readonly campaignKey: string;
    }
  | {
      readonly status: 'skipped';
      readonly reason: 'missing-email' | 'marketing-disabled';
    };

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

/**
 * Send B2C payment confirmation email (Stripe or Apple IAP).
 */
export async function sendB2CClosedWonEmail(
  input: B2CClosedWonEmailInput
): Promise<ClosedWonEmailResult> {
  const email = input.email?.trim().toLowerCase();
  if (!email) return { status: 'skipped', reason: 'missing-email' };

  const firstName = input.firstName?.trim() || DEFAULT_FIRST_NAME;
  const safeFirstName = escapeHtml(firstName);
  const isIap = input.paymentSource === 'iap_topup' || input.paymentSource === 'apple_pay';
  const campaignKey = isIap ? B2C_IAP_CAMPAIGN_KEY : B2C_STRIPE_CAMPAIGN_KEY;
  const paymentMethodLabel = isIap ? 'Apple In-App Purchase' : 'Stripe Payment';

  const amountText = input.amountFormatted
    ? escapeHtml(input.amountFormatted)
    : 'your recent transaction';
  const creditsText = input.creditsAddedFormatted
    ? escapeHtml(input.creditsAddedFormatted)
    : 'wallet credits';

  const agentXUrl = toAbsoluteAppUrl('/agent-x', { environment: input.environment });
  const usageUrl = toAbsoluteAppUrl('/usage', { environment: input.environment });

  const html = buildMarketingEmailShell({
    preheader: `Payment confirmed. ${creditsText} have been added to your NXT1 wallet.`,
    eyebrow: 'Payment Confirmed',
    title: 'Payment Confirmed! 🎉',
    subtitle: 'Your wallet credits are active and Agent X is ready for your next workflow.',
    introHtml: `
      <p style="margin:0 0 16px 0;font-size:20px;line-height:1.5;color:#101722;">Hi ${safeFirstName},</p>
      <p style="margin:0 0 20px 0;font-size:18px;line-height:1.65;color:#1f2937;">
        Thank you for your purchase! Your transaction via ${paymentMethodLabel} (${amountText}) was successful, and ${creditsText} are now active in your wallet.
      </p>
    `,
    sectionsHtml: [
      `
        <h2 style="margin:0 0 10px 0;font-size:26px;line-height:1.2;color:#111827;font-weight:800;">What's Unlocked in Your Workspace</h2>
        <ul style="margin:0 0 8px 22px;padding:0;color:#1f2937;">
          <li style="margin:0 0 10px 0;font-size:17px;line-height:1.55;"><strong>Priority AI Processing:</strong> Instant execution for film breakdowns, scout reports, and graphic workflows.</li>
          <li style="margin:0 0 10px 0;font-size:17px;line-height:1.55;"><strong>Extended Token Limits:</strong> Process longer game film, multi-page playbooks, and complex opponent scouting documents.</li>
          <li style="margin:0;font-size:17px;line-height:1.55;"><strong>Full Agent X Power:</strong> Access all AI coordinators, "The Lab" on desktop, and custom recruiter outreach tools.</li>
        </ul>
      `,
    ],
    ctaButtons: [
      { label: 'Launch Agent X', href: agentXUrl },
      { label: 'View Wallet Balance', href: usageUrl, variant: 'secondary' },
    ],
    footerHtml: `
      <p style="margin:0;font-size:13px;line-height:1.5;color:#b7c5d5;">© 2026 NXT1 Sports. All rights reserved.</p>
      <p style="margin:8px 0 0 0;font-size:12px;line-height:1.5;color:#8ea0b4;">You are receiving this payment confirmation for your recent transaction on NXT1.</p>
    `,
  });

  try {
    await sendOutboundMarketingEmail({
      to: email,
      subject: 'Payment Confirmed — Your NXT1 Wallet Credits are Active! 🎉',
      html,
      campaignKey,
      userId: input.userId,
      replyTo: 'support@nxt1sports.com',
    });

    return { status: 'sent', email, campaignKey };
  } catch (err) {
    logger.error('[MarketingEmail] B2C Closed Won email failed', {
      userId: input.userId,
      email,
      error: err instanceof Error ? err.message : String(err),
    });
    throw err;
  }
}

/**
 * Send B2B Program Admin payment confirmation & onboarding email.
 */
export async function sendB2BClosedWonAdminEmail(
  input: B2BClosedWonAdminEmailInput
): Promise<ClosedWonEmailResult> {
  const email = input.email?.trim().toLowerCase();
  if (!email) return { status: 'skipped', reason: 'missing-email' };

  const firstName = input.firstName?.trim() || DEFAULT_FIRST_NAME;
  const safeFirstName = escapeHtml(firstName);
  const safeOrganization = input.organizationName
    ? escapeHtml(input.organizationName)
    : 'your program';

  const manageTeamUrl = toAbsoluteAppUrl('/manage-team', { environment: input.environment });
  const agentXUrl = toAbsoluteAppUrl('/agent-x', { environment: input.environment });

  const html = buildMarketingEmailShell({
    preheader: `${safeOrganization}'s NXT1 Program Plan is live. Invite staff and set up team credit pools.`,
    eyebrow: 'Program Payment Confirmed',
    title: `Welcome ${safeOrganization} to NXT1 Elite 🏆`,
    subtitle: 'Program credit pools, unlimited staff seats, and dedicated AI operations are live.',
    introHtml: `
      <p style="margin:0 0 16px 0;font-size:20px;line-height:1.5;color:#101722;">Coach ${safeFirstName},</p>
      <p style="margin:0 0 20px 0;font-size:18px;line-height:1.65;color:#1f2937;">
        Congratulations! ${safeOrganization} has officially unlocked the NXT1 Program Plan. Your team command center is ready for the upcoming season.
      </p>
    `,
    sectionsHtml: [
      `
        <h2 style="margin:0 0 10px 0;font-size:30px;line-height:1.2;color:#111827;font-weight:800;">3 Quick Program Onboarding Steps</h2>
        <ul style="margin:0 0 8px 22px;padding:0;color:#1f2937;">
          <li style="margin:0 0 10px 0;font-size:18px;line-height:1.55;"><strong>Invite Coaching Staff</strong> — Add assistant coaches, analysts, and directors to your workspace.</li>
          <li style="margin:0 0 10px 0;font-size:18px;line-height:1.55;"><strong>Verify Roster Context</strong> — Ensure player names, numbers, and positions are up to date.</li>
          <li style="margin:0;font-size:18px;line-height:1.55;"><strong>Run Your First Team Scout</strong> — Use Agent X to build game plans and opponent breakdowns.</li>
        </ul>
      `,
    ],
    ctaButtons: [
      { label: 'Manage Staff & Roster', href: manageTeamUrl },
      { label: 'Open Agent X', href: agentXUrl, variant: 'secondary' },
    ],
    footerHtml: `
      <p style="margin:0;font-size:13px;line-height:1.5;color:#b7c5d5;">© 2026 NXT1 Sports. All rights reserved.</p>
      <p style="margin:8px 0 0 0;font-size:12px;line-height:1.5;color:#8ea0b4;">You are receiving this payment confirmation because you purchased a Program Plan for ${safeOrganization}.</p>
    `,
  });

  try {
    await sendOutboundMarketingEmail({
      to: email,
      subject: `Welcome to NXT1 Program Plan — ${safeOrganization} is Live! 🏆`,
      html,
      campaignKey: B2B_ADMIN_CAMPAIGN_KEY,
      userId: input.userId,
      replyTo: 'support@nxt1sports.com',
    });

    return { status: 'sent', email, campaignKey: B2B_ADMIN_CAMPAIGN_KEY };
  } catch (err) {
    logger.error('[MarketingEmail] B2B Admin Closed Won email failed', {
      userId: input.userId,
      email,
      error: err instanceof Error ? err.message : String(err),
    });
    throw err;
  }
}

/**
 * Send B2B Staff notification email when program plan upgrades.
 */
export async function sendB2BClosedWonStaffEmail(
  input: B2BClosedWonStaffEmailInput
): Promise<ClosedWonEmailResult> {
  const email = input.email?.trim().toLowerCase();
  if (!email) return { status: 'skipped', reason: 'missing-email' };

  const firstName = input.firstName?.trim() || DEFAULT_FIRST_NAME;
  const safeFirstName = escapeHtml(firstName);
  const safeOrganization = input.organizationName
    ? escapeHtml(input.organizationName)
    : 'your program';

  const agentXUrl = toAbsoluteAppUrl('/agent-x', { environment: input.environment });

  const html = buildMarketingEmailShell({
    preheader: `${safeOrganization} upgraded to NXT1 Program Plan. Your staff seat and credits are live.`,
    eyebrow: 'Staff Upgrade Active',
    title: `${safeOrganization} Unlocked NXT1 Program Plan ⚡`,
    subtitle: 'Your coaching staff seat and shared program credits are active.',
    introHtml: `
      <p style="margin:0 0 16px 0;font-size:20px;line-height:1.5;color:#101722;">Coach ${safeFirstName},</p>
      <p style="margin:0 0 20px 0;font-size:18px;line-height:1.65;color:#1f2937;">
        Great news! ${safeOrganization} has upgraded to the NXT1 Program Plan. Your staff seat is activated with full access to shared credit pools, opponent scout tools, and Agent X.
      </p>
    `,
    sectionsHtml: [
      `
        <h2 style="margin:0 0 10px 0;font-size:30px;line-height:1.2;color:#111827;font-weight:800;">Staff Tools Ready To Go</h2>
        <p style="margin:0 0 12px 0;font-size:18px;line-height:1.65;color:#1f2937;">
          Use Agent X to break down game film, generate team graphics, organize player rosters, and draft communications for ${safeOrganization}.
        </p>
      `,
    ],
    ctaButtons: [{ label: 'Access Team Workspace', href: agentXUrl }],
    footerHtml: `
      <p style="margin:0;font-size:13px;line-height:1.5;color:#b7c5d5;">© 2026 NXT1 Sports. All rights reserved.</p>
      <p style="margin:8px 0 0 0;font-size:12px;line-height:1.5;color:#8ea0b4;">You are receiving this update as a staff member of ${safeOrganization}.</p>
    `,
  });

  try {
    await sendOutboundMarketingEmail({
      to: email,
      subject: `${safeOrganization} Upgraded to NXT1 Program Plan! ⚡`,
      html,
      campaignKey: B2B_STAFF_CAMPAIGN_KEY,
      userId: input.userId,
      replyTo: 'support@nxt1sports.com',
    });

    return { status: 'sent', email, campaignKey: B2B_STAFF_CAMPAIGN_KEY };
  } catch (err) {
    logger.error('[MarketingEmail] B2B Staff Closed Won email failed', {
      userId: input.userId,
      email,
      error: err instanceof Error ? err.message : String(err),
    });
    throw err;
  }
}

/**
 * Send B2B Athlete Broadcast email when program plan unlocks.
 */
export async function sendB2BClosedWonAthleteBroadcastEmail(
  input: B2BClosedWonAthleteEmailInput
): Promise<ClosedWonEmailResult> {
  const email = input.email?.trim().toLowerCase();
  if (!email) return { status: 'skipped', reason: 'missing-email' };

  const firstName = input.firstName?.trim() || DEFAULT_FIRST_NAME;
  const safeFirstName = escapeHtml(firstName);
  const safeOrganization = input.organizationName
    ? escapeHtml(input.organizationName)
    : 'your program';

  const agentXUrl = toAbsoluteAppUrl('/agent-x', { environment: input.environment });

  const html = buildMarketingEmailShell({
    preheader: `Great news! ${safeOrganization} unlocked a program plan for your team.`,
    eyebrow: 'Team Program Unlocked',
    title: `${safeOrganization} Unlocked NXT1 For Your Team! 🚀`,
    subtitle: 'Your Agent X athlete access and team tools are active.',
    introHtml: `
      <p style="margin:0 0 16px 0;font-size:20px;line-height:1.5;color:#101722;">Hi ${safeFirstName},</p>
      <p style="margin:0 0 20px 0;font-size:18px;line-height:1.65;color:#1f2937;">
        Awesome news! ${safeOrganization} has unlocked a program plan on NXT1. Your athlete account is connected to the team workspace with full access to film breakdowns, highlight graphics, and Agent X.
      </p>
    `,
    sectionsHtml: [
      `
        <h2 style="margin:0 0 10px 0;font-size:30px;line-height:1.2;color:#111827;font-weight:800;">Get Started</h2>
        <p style="margin:0 0 12px 0;font-size:18px;line-height:1.65;color:#1f2937;">
          Open NXT1 to view team game plans, build your athletic resume, and generate shareable graphics for the season.
        </p>
      `,
    ],
    ctaButtons: [{ label: 'Launch Agent X', href: agentXUrl }],
    footerHtml: `
      <p style="margin:0;font-size:13px;line-height:1.5;color:#b7c5d5;">© 2026 NXT1 Sports. All rights reserved.</p>
      <p style="margin:8px 0 0 0;font-size:12px;line-height:1.5;color:#8ea0b4;">You are receiving this update as an athlete on ${safeOrganization}'s roster.</p>
    `,
  });

  try {
    await sendOutboundMarketingEmail({
      to: email,
      subject: `${safeOrganization} Unlocked NXT1 for Your Team! 🚀`,
      html,
      campaignKey: B2B_ATHLETE_BROADCAST_CAMPAIGN_KEY,
      userId: input.userId,
      replyTo: 'support@nxt1sports.com',
    });

    return { status: 'sent', email, campaignKey: B2B_ATHLETE_BROADCAST_CAMPAIGN_KEY };
  } catch (err) {
    logger.error('[MarketingEmail] B2B Athlete Broadcast Closed Won email failed', {
      userId: input.userId,
      email,
      error: err instanceof Error ? err.message : String(err),
    });
    throw err;
  }
}
