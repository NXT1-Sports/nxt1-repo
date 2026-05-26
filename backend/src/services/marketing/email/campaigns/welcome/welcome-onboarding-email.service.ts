/**
 * @fileoverview New Signup Welcome Campaign
 * @module @nxt1/backend/services/marketing/email/campaigns/welcome/welcome-onboarding-email
 *
 * Sends the primary welcome/introduction email for newly onboarded users.
 * Uses role-aware variants so athlete and team/staff signups receive copy
 * tailored to their NXT1 workflows.
 */

import { isTeamRole } from '@nxt1/core';
import type { UserRole } from '@nxt1/core';
import { sendOutboundMarketingEmail } from '../../outbound-email.service.js';
import { logger } from '../../../../../utils/logger.js';
import { toAbsoluteAppUrl } from '../../../../../utils/app-url.js';
import type { RuntimeEnvironment } from '../../../../../config/runtime-environment.js';
import { buildMarketingEmailShell } from '../../templates/marketing-email-shell.js';

const ATHLETE_CAMPAIGN_KEY = 'welcome_intro_athlete';
const TEAM_CAMPAIGN_KEY = 'welcome_intro_team';
const DEFAULT_FIRST_NAME = 'NXT1 Member';

interface WelcomeOnboardingEmailInput {
  readonly userId: string;
  readonly email?: string | null;
  readonly firstName?: string | null;
  readonly environment: RuntimeEnvironment;
  readonly role: UserRole;
  readonly primarySport?: string | null;
  readonly organizationName?: string | null;
  readonly marketingEnabled?: boolean;
}

export type WelcomeOnboardingEmailResult =
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

function buildAthleteWelcomeEmail(args: {
  readonly firstName: string;
  readonly environment: RuntimeEnvironment;
  readonly primarySport?: string | null;
}): { readonly subject: string; readonly html: string; readonly campaignKey: string } {
  const homeUrl = toAbsoluteAppUrl('/home', { environment: args.environment });
  const helpCenterUrl = toAbsoluteAppUrl('/help-center', { environment: args.environment });
  const safeFirstName = escapeHtml(args.firstName);
  const safeSport = args.primarySport ? escapeHtml(args.primarySport) : 'your sport';

  return {
    subject: 'Welcome to NXT1 - your athlete command center is ready',
    campaignKey: ATHLETE_CAMPAIGN_KEY,
    html: buildMarketingEmailShell({
      preheader:
        'Your NXT1 athlete command center is ready for planning, performance, communication, and AI-assisted execution.',
      eyebrow: 'Welcome to NXT1',
      title: 'Your Athlete Command Center Is Live',
      subtitle: 'Profile, planning, performance, communication, and AI support in one place.',
      introHtml: `
        <p style="margin:0 0 16px 0;font-size:20px;line-height:1.5;color:#101722;">Hi ${safeFirstName},</p>
        <p style="margin:0 0 20px 0;font-size:18px;line-height:1.65;color:#1f2937;">
          Welcome to NXT1. Your account is active and ready to help you organize your story,
          plan your next moves, strengthen your communication, and execute with more consistency across ${safeSport}.
        </p>
      `,
      sectionsHtml: [
        `
          <h2 style="margin:0 0 10px 0;font-size:30px;line-height:1.2;color:#111827;font-weight:800;">Start With the Essentials</h2>
          <ul style="margin:0 0 8px 22px;padding:0;color:#1f2937;">
            <li style="margin:0 0 10px 0;font-size:18px;line-height:1.55;"><strong>Complete your profile</strong> so coaches, scouts, and collaborators see the right picture immediately.</li>
            <li style="margin:0 0 10px 0;font-size:18px;line-height:1.55;"><strong>Organize your assets, activity, and performance context</strong> so your film, updates, and momentum all stay in one place.</li>
            <li style="margin:0;font-size:18px;line-height:1.55;"><strong>Set your first workflows</strong> for outreach, routines, opportunities, and the next steps that matter most.</li>
          </ul>
        `,
        `
          <h2 style="margin:0 0 10px 0;font-size:30px;line-height:1.2;color:#111827;font-weight:800;">Use Agent X as Your Edge</h2>
          <p style="margin:0 0 12px 0;font-size:18px;line-height:1.65;color:#1f2937;">
            Agent X can help you sharpen outreach, organize priorities, build creative assets,
            prepare communications, and turn scattered tasks into one operating system.
          </p>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;">
            <tr>
              <td style="background-color:#edf8cf;border:1px solid #cfe89b;border-left:4px solid #91c11f;border-radius:8px;padding:14px;">
                <p style="margin:0;font-size:16px;line-height:1.55;color:#25320d;"><strong>Suggested first move:</strong> finish your profile, then open Agent X and ask for your first athlete action plan across recruiting, performance, and day-to-day execution.</p>
              </td>
            </tr>
          </table>
        `,
        `
          <h2 style="margin:0 0 10px 0;font-size:30px;line-height:1.2;color:#111827;font-weight:800;">We Built This for Real Work</h2>
          <p style="margin:0;font-size:18px;line-height:1.65;color:#1f2937;">
            NXT1 is designed to help athletes move with better information, clearer priorities,
            stronger presentation, and more consistent execution. If you need help, our support and help center are ready.
          </p>
        `,
      ],
      ctaButtons: [
        { label: 'Open NXT1', href: homeUrl },
        { label: 'Help Center', href: helpCenterUrl, variant: 'secondary' },
      ],
      footerHtml: `
        <p style="margin:0;font-size:13px;line-height:1.5;color:#b7c5d5;">© 2026 NXT1 Sports. All rights reserved.</p>
        <p style="margin:8px 0 0 0;font-size:12px;line-height:1.5;color:#8ea0b4;">You are receiving this welcome email because you created a new NXT1 account.</p>
      `,
    }),
  };
}

function buildTeamWelcomeEmail(args: {
  readonly firstName: string;
  readonly environment: RuntimeEnvironment;
  readonly primarySport?: string | null;
  readonly organizationName?: string | null;
}): { readonly subject: string; readonly html: string; readonly campaignKey: string } {
  const homeUrl = toAbsoluteAppUrl('/home', { environment: args.environment });
  const helpCenterUrl = toAbsoluteAppUrl('/help-center', { environment: args.environment });
  const safeFirstName = escapeHtml(args.firstName);
  const safeSport = args.primarySport ? escapeHtml(args.primarySport) : 'your sport';
  const safeOrganization = args.organizationName
    ? escapeHtml(args.organizationName)
    : 'your program';

  return {
    subject: 'Welcome to NXT1 - your program command center is ready',
    campaignKey: TEAM_CAMPAIGN_KEY,
    html: buildMarketingEmailShell({
      preheader:
        'Your NXT1 team command center is ready for roster, planning, and AI-assisted operations.',
      eyebrow: 'Welcome to NXT1',
      title: 'Your Program Command Center Is Live',
      subtitle: 'Roster, operations, creative, and AI workflows built for leaders.',
      introHtml: `
        <p style="margin:0 0 16px 0;font-size:20px;line-height:1.5;color:#101722;">Hi ${safeFirstName},</p>
        <p style="margin:0 0 20px 0;font-size:18px;line-height:1.65;color:#1f2937;">
          Welcome to NXT1. Your account is ready to help ${safeOrganization} operate with more structure,
          stronger visibility, and faster execution across ${safeSport}.
        </p>
      `,
      sectionsHtml: [
        `
          <h2 style="margin:0 0 10px 0;font-size:30px;line-height:1.2;color:#111827;font-weight:800;">Build the Right Foundation</h2>
          <ul style="margin:0 0 8px 22px;padding:0;color:#1f2937;">
            <li style="margin:0 0 10px 0;font-size:18px;line-height:1.55;"><strong>Finalize your team and roster context</strong> so workflows and recommendations stay anchored to the right program.</li>
            <li style="margin:0 0 10px 0;font-size:18px;line-height:1.55;"><strong>Connect your core sources</strong> to create one operating layer across media, recruiting, and communications.</li>
            <li style="margin:0;font-size:18px;line-height:1.55;"><strong>Establish your first workflows</strong> for planning, scouting, operations, and outbound execution.</li>
          </ul>
        `,
        `
          <h2 style="margin:0 0 10px 0;font-size:30px;line-height:1.2;color:#111827;font-weight:800;">Put Agent X to Work Immediately</h2>
          <p style="margin:0 0 12px 0;font-size:18px;line-height:1.65;color:#1f2937;">
            Agent X can help your staff organize game plans, build recruiting workflows, create media,
            and turn team information into action without adding more operational drag.
          </p>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;">
            <tr>
              <td style="background-color:#edf8cf;border:1px solid #cfe89b;border-left:4px solid #91c11f;border-radius:8px;padding:14px;">
                <p style="margin:0;font-size:16px;line-height:1.55;color:#25320d;"><strong>Suggested first move:</strong> open NXT1, confirm your program context, then use Agent X to outline your first operational workflow.</p>
              </td>
            </tr>
          </table>
        `,
        `
          <h2 style="margin:0 0 10px 0;font-size:30px;line-height:1.2;color:#111827;font-weight:800;">Built for Professional Execution</h2>
          <p style="margin:0;font-size:18px;line-height:1.65;color:#1f2937;">
            NXT1 is designed to help teams and staff operate with better visibility, cleaner processes,
            and a stronger command layer across the entire program.
          </p>
        `,
      ],
      ctaButtons: [
        { label: 'Open NXT1', href: homeUrl },
        { label: 'Help Center', href: helpCenterUrl, variant: 'secondary' },
      ],
      footerHtml: `
        <p style="margin:0;font-size:13px;line-height:1.5;color:#b7c5d5;">© 2026 NXT1 Sports. All rights reserved.</p>
        <p style="margin:8px 0 0 0;font-size:12px;line-height:1.5;color:#8ea0b4;">You are receiving this welcome email because you created a new NXT1 account.</p>
      `,
    }),
  };
}

export async function sendWelcomeOnboardingEmail(
  input: WelcomeOnboardingEmailInput
): Promise<WelcomeOnboardingEmailResult> {
  if (input.marketingEnabled === false) {
    return { status: 'skipped', reason: 'marketing-disabled' };
  }

  const email = input.email?.trim().toLowerCase();
  if (!email) {
    return { status: 'skipped', reason: 'missing-email' };
  }

  const firstName = input.firstName?.trim() || DEFAULT_FIRST_NAME;
  const variant = isTeamRole(input.role)
    ? buildTeamWelcomeEmail({
        firstName,
        environment: input.environment,
        primarySport: input.primarySport,
        organizationName: input.organizationName,
      })
    : buildAthleteWelcomeEmail({
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

    logger.error('[MarketingEmail] Welcome onboarding email failed', {
      userId: input.userId,
      email,
      role: input.role,
      error: message,
    });

    throw err;
  }
}
