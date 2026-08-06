/**
 * @fileoverview Trial Credits Finished Campaign Email Service
 * @module @nxt1/backend/services/marketing/email/campaigns/trial-credits-finished/trial-credits-finished-email
 *
 * Sends an email encouraging wallet top-up / plan upgrade when trial credits are depleted.
 * Enforces the Org-Covered Athlete Guard (athletes under team plans do not receive this email).
 */

import { isTeamRole } from '@nxt1/core';
import type { UserRole } from '@nxt1/core';
import { sendOutboundMarketingEmail } from '../../outbound-email.service.js';
import { logger } from '../../../../../utils/logger.js';
import { toAbsoluteAppUrl } from '../../../../../utils/app-url.js';
import type { RuntimeEnvironment } from '../../../../../config/runtime-environment.js';
import { buildMarketingEmailShell } from '../../templates/marketing-email-shell.js';

const ATHLETE_CAMPAIGN_KEY = 'trial_credits_finished_athlete';
const TEAM_CAMPAIGN_KEY = 'trial_credits_finished_team';
const DEFAULT_FIRST_NAME = 'NXT1 Member';

export interface TrialCreditsFinishedEmailInput {
  readonly userId: string;
  readonly email?: string | null;
  readonly firstName?: string | null;
  readonly environment: RuntimeEnvironment;
  readonly role: UserRole;
  readonly primarySport?: string | null;
  readonly organizationName?: string | null;
  readonly paymentState?: string | null;
  readonly organizationId?: string | null;
  readonly marketingEnabled?: boolean;
}

export type TrialCreditsFinishedEmailResult =
  | {
      readonly status: 'sent';
      readonly email: string;
      readonly campaignKey: string;
    }
  | {
      readonly status: 'skipped';
      readonly reason: 'missing-email' | 'marketing-disabled' | 'org-covered-athlete';
    };

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function buildAthleteTrialFinishedEmail(args: {
  readonly firstName: string;
  readonly environment: RuntimeEnvironment;
  readonly primarySport?: string | null;
}): { readonly subject: string; readonly html: string; readonly campaignKey: string } {
  const usageUrl = toAbsoluteAppUrl('/usage', { environment: args.environment });
  const agentXUrl = toAbsoluteAppUrl('/agent-x', { environment: args.environment });
  const safeFirstName = escapeHtml(args.firstName);

  return {
    subject: 'Your Trial Credits Are Complete — Top Up to Keep Building ⚡',
    campaignKey: ATHLETE_CAMPAIGN_KEY,
    html: buildMarketingEmailShell({
      preheader:
        'You have used all your NXT1 trial credits. Add $5 or $10 in credits to your wallet to keep Agent X active with zero subscription lock-ins.',
      eyebrow: 'Trial Credits Complete',
      title: 'Keep Your Momentum Going',
      subtitle: 'Top up your wallet with $5 or $10 to keep Agent X running uninterrupted.',
      introHtml: `
        <p style="margin:0 0 16px 0;font-size:20px;line-height:1.5;color:#101722;">Hi ${safeFirstName},</p>
        <p style="margin:0 0 20px 0;font-size:18px;line-height:1.65;color:#1f2937;">
          You've used 100% of your free trial credits! You've experienced what Agent X can do for your film, graphics, scouting, and recruiting — now keep your momentum going without interruption.
        </p>
      `,
      sectionsHtml: [
        `
          <h2 style="margin:0 0 10px 0;font-size:26px;line-height:1.2;color:#111827;font-weight:800;">Pay Only for What You Use — No Monthly Contracts</h2>
          <p style="margin:0 0 12px 0;font-size:17px;line-height:1.65;color:#1f2937;">
            NXT1 operates on simple, flexible usage credits. Simply top up your personal wallet with $5 or $10 whenever you need film breakdowns, social graphics, or recruiter outreach campaigns executed.
          </p>
          <div style="background-color:#edf8cf;border:1px solid #cfe89b;border-left:4px solid #91c11f;border-radius:8px;padding:16px;margin-top:12px;">
            <p style="margin:0 0 4px 0;font-size:16px;font-weight:700;color:#25320d;">⚡ Credits Never Expire</p>
            <p style="margin:0;font-size:15px;line-height:1.5;color:#25320d;">Your wallet credits stay in your account forever until you use them. Add credits as you go with full flexibility and total control.</p>
          </div>
        `,
      ],
      ctaButtons: [
        { label: 'Top Up Wallet ($5 / $10)', href: usageUrl },
        { label: 'Open Agent X', href: agentXUrl, variant: 'secondary' },
      ],
      footerHtml: `
        <p style="margin:0;font-size:13px;line-height:1.5;color:#b7c5d5;">© 2026 NXT1 Sports. All rights reserved.</p>
        <p style="margin:8px 0 0 0;font-size:12px;line-height:1.5;color:#8ea0b4;">You are receiving this notification because your NXT1 trial credits have reached 0.</p>
      `,
    }),
  };
}

function buildTeamTrialFinishedEmail(args: {
  readonly firstName: string;
  readonly environment: RuntimeEnvironment;
  readonly primarySport?: string | null;
  readonly organizationName?: string | null;
}): { readonly subject: string; readonly html: string; readonly campaignKey: string } {
  const manageTeamUrl = toAbsoluteAppUrl('/manage-team', { environment: args.environment });
  const usageUrl = toAbsoluteAppUrl('/usage', { environment: args.environment });
  const safeFirstName = escapeHtml(args.firstName);
  const safeOrganization = args.organizationName
    ? escapeHtml(args.organizationName)
    : 'your program';

  return {
    subject: `Program Trial Complete — Lock In ${safeOrganization}'s Staff Access 🏆`,
    campaignKey: TEAM_CAMPAIGN_KEY,
    html: buildMarketingEmailShell({
      preheader:
        'Your program trial credits are complete. Select a team plan to keep staff seats and credit pools active.',
      eyebrow: 'Program Trial Complete',
      title: 'Lock In Your Program Command Center',
      subtitle: `Keep your staff, rosters, and operational workflows active for ${safeOrganization}.`,
      introHtml: `
        <p style="margin:0 0 16px 0;font-size:20px;line-height:1.5;color:#101722;">Coach ${safeFirstName},</p>
        <p style="margin:0 0 20px 0;font-size:18px;line-height:1.65;color:#1f2937;">
          ${safeOrganization}'s trial credits are complete. Your coaching staff has seen how Agent X streamlines scout reports, roster analytics, and team media.
        </p>
      `,
      sectionsHtml: [
        `
          <h2 style="margin:0 0 10px 0;font-size:30px;line-height:1.2;color:#111827;font-weight:800;">Secure Full Staff & Team Access</h2>
          <p style="margin:0 0 12px 0;font-size:18px;line-height:1.65;color:#1f2937;">
            Select a Team Plan to unlock shared organization credit pools, unlimited staff seats, priority AI queueing, and dedicated support.
          </p>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;">
            <tr>
              <td style="background-color:#edf8cf;border:1px solid #cfe89b;border-left:4px solid #91c11f;border-radius:8px;padding:14px;">
                <p style="margin:0;font-size:16px;line-height:1.55;color:#25320d;"><strong>Program Guarantee:</strong> Keep all your saved scout reports, custom prompts, and team roster context intact.</p>
              </td>
            </tr>
          </table>
        `,
      ],
      ctaButtons: [
        { label: 'Select Program Plan', href: manageTeamUrl },
        { label: 'View Credit Usage', href: usageUrl, variant: 'secondary' },
      ],
      footerHtml: `
        <p style="margin:0;font-size:13px;line-height:1.5;color:#b7c5d5;">© 2026 NXT1 Sports. All rights reserved.</p>
        <p style="margin:8px 0 0 0;font-size:12px;line-height:1.5;color:#8ea0b4;">You are receiving this notification because your program's trial credits are complete.</p>
      `,
    }),
  };
}

export async function sendTrialCreditsFinishedEmail(
  input: TrialCreditsFinishedEmailInput
): Promise<TrialCreditsFinishedEmailResult> {
  if (input.marketingEnabled === false) {
    return { status: 'skipped', reason: 'marketing-disabled' };
  }

  const email = input.email?.trim().toLowerCase();
  if (!email) {
    return { status: 'skipped', reason: 'missing-email' };
  }

  // Org-Covered Athlete Guard:
  // Athletes under an organization or with paymentState === 'org-covered' MUST NOT receive payment request emails!
  const isOrgCoveredAthlete =
    input.role === 'athlete' &&
    (input.paymentState === 'org-covered' || Boolean(input.organizationId));

  if (isOrgCoveredAthlete) {
    logger.info(
      '[MarketingEmail] Suppressed trial credits finished email for org-covered athlete',
      {
        userId: input.userId,
        email,
        organizationId: input.organizationId,
        paymentState: input.paymentState,
      }
    );
    return { status: 'skipped', reason: 'org-covered-athlete' };
  }

  const firstName = input.firstName?.trim() || DEFAULT_FIRST_NAME;
  const variant = isTeamRole(input.role)
    ? buildTeamTrialFinishedEmail({
        firstName,
        environment: input.environment,
        primarySport: input.primarySport,
        organizationName: input.organizationName,
      })
    : buildAthleteTrialFinishedEmail({
        firstName,
        environment: input.environment,
        primarySport: input.primarySport,
      });

  try {
    await sendOutboundMarketingEmail({
      to: email,
      subject: variant.subject,
      html: variant.html,
      campaignKey: variant.campaignKey,
      userId: input.userId,
      replyTo: 'support@nxt1sports.com',
    });

    return {
      status: 'sent',
      email,
      campaignKey: variant.campaignKey,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);

    logger.error('[MarketingEmail] Trial credits finished email failed', {
      userId: input.userId,
      email,
      role: input.role,
      error: message,
    });

    throw err;
  }
}
