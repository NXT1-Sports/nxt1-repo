/**
 * @fileoverview Usage Started Campaign Email Service
 * @module @nxt1/backend/services/marketing/email/campaigns/usage-started/usage-started-email
 *
 * Sends an email celebrating the user's or program's first positive Agent X deliverable/wallet transaction.
 */

import { isTeamRole } from '@nxt1/core';
import type { UserRole } from '@nxt1/core';
import { sendOutboundMarketingEmail } from '../../outbound-email.service.js';
import { logger } from '../../../../../utils/logger.js';
import { toAbsoluteAppUrl } from '../../../../../utils/app-url.js';
import type { RuntimeEnvironment } from '../../../../../config/runtime-environment.js';
import { buildMarketingEmailShell } from '../../templates/marketing-email-shell.js';

const ATHLETE_CAMPAIGN_KEY = 'usage_started_athlete';
const TEAM_CAMPAIGN_KEY = 'usage_started_team';
const DEFAULT_FIRST_NAME = 'NXT1 Member';

export interface UsageStartedEmailInput {
  readonly userId: string;
  readonly email?: string | null;
  readonly firstName?: string | null;
  readonly environment: RuntimeEnvironment;
  readonly role: UserRole;
  readonly primarySport?: string | null;
  readonly organizationName?: string | null;
  readonly marketingEnabled?: boolean;
}

export type UsageStartedEmailResult =
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

function buildAthleteUsageStartedEmail(args: {
  readonly firstName: string;
  readonly environment: RuntimeEnvironment;
  readonly primarySport?: string | null;
}): { readonly subject: string; readonly html: string; readonly campaignKey: string } {
  const agentXUrl = toAbsoluteAppUrl('/agent-x', { environment: args.environment });
  const profileUrl = toAbsoluteAppUrl('/profile', { environment: args.environment });
  const safeFirstName = escapeHtml(args.firstName);

  return {
    subject: "First Deliverable Complete! Here's What Agent X Can Do Next 🚀",
    campaignKey: ATHLETE_CAMPAIGN_KEY,
    html: buildMarketingEmailShell({
      preheader:
        'Your first Agent X deliverable is complete. See your output and try your next workflow.',
      eyebrow: 'Agent X Milestone',
      title: 'Your First Deliverable Is Ready',
      subtitle: 'You completed your first Agent X workflow on NXT1.',
      introHtml: `
        <p style="margin:0 0 16px 0;font-size:20px;line-height:1.5;color:#101722;">Congrats ${safeFirstName}!</p>
        <p style="margin:0 0 20px 0;font-size:18px;line-height:1.65;color:#1f2937;">
          You just ran your first workflow with Agent X! Your athletic command center is officially in action.
        </p>
      `,
      sectionsHtml: [
        `
          <h2 style="margin:0 0 10px 0;font-size:26px;line-height:1.2;color:#111827;font-weight:800;">Building Momentum</h2>
          <p style="margin:0 0 12px 0;font-size:17px;line-height:1.65;color:#1f2937;">
            Now that you've seen Agent X in action, the key to unlocking maximum value is making NXT1 part of your weekly execution routine. Here is how to keep your momentum going:
          </p>
          <ul style="margin:0 0 16px 22px;padding:0;color:#1f2937;">
            <li style="margin:0 0 10px 0;font-size:16px;line-height:1.55;">
              <strong>Put Tasks on Recurring Schedule:</strong> Set weekly film breakdowns, graphic updates, and progress reports to run automatically so Agent X delivers them every single week.
            </li>
            <li style="margin:0 0 10px 0;font-size:16px;line-height:1.55;">
              <strong>Keep Your Profile Context Fresh:</strong> Click <strong>"Add Updates"</strong> on your profile whenever you get new stats, video links, or transcripts so Agent X always works from your latest data.
            </li>
            <li style="margin:0;font-size:16px;line-height:1.55;">
              <strong>Explore AI Coordinators Prompts & "The Lab":</strong> Use 100s of 1-click AI coordinators prompts, or launch <strong>"The Lab"</strong> on desktop for deep film and document breakdowns.
            </li>
          </ul>
        `,
        `
          <div style="background-color:#edf8cf;border:1px solid #cfe89b;border-left:4px solid #91c11f;border-radius:8px;padding:16px;margin:12px 0;">
            <p style="margin:0 0 6px 0;font-size:16px;font-weight:700;color:#25320d;">💡 Pro Tip for Maximum AI Quality</p>
            <p style="margin:0;font-size:15px;line-height:1.55;color:#25320d;">Don't forget to make sure your profile is completely filled out for the best AI outputs and results possible! When Agent X knows your stats, GPA, positions, and target goals, every deliverable gets 10x sharper.</p>
          </div>
        `,
        `
          <h2 style="margin:16px 0 10px 0;font-size:26px;line-height:1.2;color:#111827;font-weight:800;">3 Workflows To Try Next</h2>
          <ul style="margin:0 0 8px 22px;padding:0;color:#1f2937;">
            <li style="margin:0 0 10px 0;font-size:17px;line-height:1.55;"><strong>Generate an Opponent Scout Report</strong> — Break down key player stats and game tendencies.</li>
            <li style="margin:0 0 10px 0;font-size:17px;line-height:1.55;"><strong>Create a Social Highlight Card</strong> — Turn your game stats into clean, shareable graphics.</li>
            <li style="margin:0;font-size:17px;line-height:1.55;"><strong>Draft Personalized Outreach</strong> — Send direct emails or DMs to college coaches or recruiters.</li>
          </ul>
        `,
      ],
      ctaButtons: [
        { label: 'View Output in Agent X', href: agentXUrl },
        { label: 'Complete Profile', href: profileUrl, variant: 'secondary' },
      ],
      footerHtml: `
        <p style="margin:0;font-size:13px;line-height:1.5;color:#b7c5d5;">© 2026 NXT1 Sports. All rights reserved.</p>
        <p style="margin:8px 0 0 0;font-size:12px;line-height:1.5;color:#8ea0b4;">You are receiving this update because you executed your first Agent X workflow on NXT1.</p>
      `,
    }),
  };
}

function buildTeamUsageStartedEmail(args: {
  readonly firstName: string;
  readonly environment: RuntimeEnvironment;
  readonly primarySport?: string | null;
  readonly organizationName?: string | null;
}): { readonly subject: string; readonly html: string; readonly campaignKey: string } {
  const agentXUrl = toAbsoluteAppUrl('/agent-x', { environment: args.environment });
  const helpCenterUrl = toAbsoluteAppUrl('/help-center', { environment: args.environment });
  const safeFirstName = escapeHtml(args.firstName);
  const safeSport = args.primarySport ? escapeHtml(args.primarySport) : 'your sport';
  const safeOrganization = args.organizationName
    ? escapeHtml(args.organizationName)
    : 'your program';

  return {
    subject: "First Program Deliverable Complete! Here's What Agent X Can Do Next 🚀",
    campaignKey: TEAM_CAMPAIGN_KEY,
    html: buildMarketingEmailShell({
      preheader:
        "Your program's first Agent X workflow is complete. See your team output and next steps.",
      eyebrow: 'Program Milestone',
      title: 'First Team Deliverable Is Live',
      subtitle: 'Your staff executed its first Agent X workflow on NXT1.',
      introHtml: `
        <p style="margin:0 0 16px 0;font-size:20px;line-height:1.5;color:#101722;">Congrats Coach ${safeFirstName}!</p>
        <p style="margin:0 0 20px 0;font-size:18px;line-height:1.65;color:#1f2937;">
          ${safeOrganization} just executed its first AI operational workflow on NXT1. Your team command center is up and running for ${safeSport}.
        </p>
      `,
      sectionsHtml: [
        `
          <h2 style="margin:0 0 10px 0;font-size:30px;line-height:1.2;color:#111827;font-weight:800;">Program Operations Elevated</h2>
          <p style="margin:0 0 12px 0;font-size:18px;line-height:1.65;color:#1f2937;">
            By automating scout reports, roster analytics, or graphic assets, your coaching staff frees up valuable time to focus on strategy, player development, and winning.
          </p>
        `,
        `
          <div style="background-color:#0b0f13;border:1px solid #1f2b38;border-radius:12px;padding:20px;margin:16px 0;color:#ffffff;">
            <p style="margin:0 0 6px 0;font-size:13px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:#ccff00;">🎬 How to Use Film Review in "The Lab"</p>
            <h3 style="margin:0 0 10px 0;font-size:22px;line-height:1.3;color:#ffffff;font-weight:800;">3-Step Guide to Breakdown Your Film</h3>
            <ol style="margin:0 0 0 20px;padding:0;color:#d7e0ea;">
              <li style="margin:0 0 8px 0;font-size:15px;line-height:1.55;"><strong>Upload Videos to The Lab:</strong> Launch <strong>"The Lab"</strong> on desktop and upload your raw game film and video clips.</li>
              <li style="margin:0 0 8px 0;font-size:15px;line-height:1.55;"><strong>Run Automated Breakdown:</strong> Click on your video inside The Lab to run and upload the AI film breakdown.</li>
              <li style="margin:0;font-size:15px;line-height:1.55;"><strong>Query in Chat or Ask Agent:</strong> Select and drop clip breakdowns directly into chat, or click the <strong>"Ask Agent"</strong> button for 1-click prebuilt prompts.</li>
            </ol>
          </div>
        `,
        `
          <h2 style="margin:0 0 10px 0;font-size:30px;line-height:1.2;color:#111827;font-weight:800;">Recommended Next Staff Moves</h2>
          <ul style="margin:0 0 8px 22px;padding:0;color:#1f2937;">
            <li style="margin:0 0 10px 0;font-size:18px;line-height:1.55;"><strong>Outline Game Day Preparation</strong>: Generate a structured practice plan or opponent evaluation.</li>
            <li style="margin:0 0 10px 0;font-size:18px;line-height:1.55;"><strong>Design Team Announcement Graphics</strong>: Create branded media for roster announcements or game results.</li>
            <li style="margin:0;font-size:18px;line-height:1.55;"><strong>Draft Program Communications</strong>: Prepare weekly updates for players, parents, or staff.</li>
          </ul>
        `,
      ],
      ctaButtons: [
        { label: 'View Output in Agent X', href: agentXUrl },
        { label: 'Help Center', href: helpCenterUrl, variant: 'secondary' },
      ],
      footerHtml: `
        <p style="margin:0;font-size:13px;line-height:1.5;color:#b7c5d5;">© 2026 NXT1 Sports. All rights reserved.</p>
        <p style="margin:8px 0 0 0;font-size:12px;line-height:1.5;color:#8ea0b4;">You are receiving this update because your program executed its first Agent X workflow on NXT1.</p>
      `,
    }),
  };
}

export async function sendUsageStartedEmail(
  input: UsageStartedEmailInput
): Promise<UsageStartedEmailResult> {
  if (input.marketingEnabled === false) {
    return { status: 'skipped', reason: 'marketing-disabled' };
  }

  const email = input.email?.trim().toLowerCase();
  if (!email) {
    return { status: 'skipped', reason: 'missing-email' };
  }

  const firstName = input.firstName?.trim() || DEFAULT_FIRST_NAME;
  const variant = isTeamRole(input.role)
    ? buildTeamUsageStartedEmail({
        firstName,
        environment: input.environment,
        primarySport: input.primarySport,
        organizationName: input.organizationName,
      })
    : buildAthleteUsageStartedEmail({
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

    logger.error('[MarketingEmail] Usage started email failed', {
      userId: input.userId,
      email,
      role: input.role,
      error: message,
    });

    throw err;
  }
}
