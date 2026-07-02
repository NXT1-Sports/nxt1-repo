/**
 * @fileoverview Monthly Campaign 02 Marketing Email
 * @module @nxt1/backend/services/marketing/email/campaigns/monthly/monthly-campaign-02-email
 *
 * Role-based monthly campaign focused on Agent X workflows.
 * Coach/director variants emphasize Film Review and Files panel coaching prompts.
 */

import type { UserRole } from '@nxt1/core';
import { isTeamRole } from '@nxt1/core';
import { sendOutboundMarketingEmail } from '../../outbound-email.service.js';
import { logger } from '../../../../../utils/logger.js';
import { toAbsoluteAppUrl } from '../../../../../utils/app-url.js';
import type { RuntimeEnvironment } from '../../../../../config/runtime-environment.js';
import { buildMarketingEmailShell } from '../../templates/marketing-email-shell.js';

const DEFAULT_FIRST_NAME = 'NXT1 Member';
const ATHLETE_MOBILE_IMAGE_URL =
  'https://raw.githubusercontent.com/NXT1-Sports/nxt1-repo/main/packages/design-tokens/assets/images/email-campaign-mobile-athlete.png';
const COACH_CAMPAIGN_IMAGE_URL =
  'https://raw.githubusercontent.com/NXT1-Sports/nxt1-repo/main/packages/design-tokens/assets/images/email-campaign-coach.png';

interface MonthlyCampaign02EmailInput {
  readonly userId?: string;
  readonly email: string;
  readonly firstName?: string | null;
  readonly role: UserRole;
  readonly environment: RuntimeEnvironment;
  readonly primarySport?: string | null;
  readonly organizationName?: string | null;
}

interface MonthlyCampaignEmailVariant {
  readonly subject: string;
  readonly campaignKey: string;
  readonly html: string;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function normalizeOrganizationLabel(value?: string | null): string {
  const normalized = (value ?? '').trim();
  if (!normalized) {
    return 'athletics';
  }

  if (normalized.toLowerCase() === 'nxt1 athletics') {
    return 'athletics';
  }

  return normalized;
}

function buildAthleteVariant(args: {
  readonly firstName: string;
  readonly environment: RuntimeEnvironment;
  readonly primarySport?: string | null;
}): MonthlyCampaignEmailVariant {
  const appUrl = toAbsoluteAppUrl('/agent-x', { environment: args.environment });
  const helpUrl = toAbsoluteAppUrl('/help-center', { environment: args.environment });
  const sport = args.primarySport ? escapeHtml(args.primarySport) : 'your sport';
  const firstName = escapeHtml(args.firstName);

  return {
    subject: 'Athletes: just ask Agent X and let it run the work',
    campaignKey: 'monthly_campaign_02_athlete',
    html: buildMarketingEmailShell({
      preheader:
        'Recruiting, media, NIL, partnerships, and weekly execution all start with one instruction to Agent X.',
      eyebrow: 'Monthly Campaign 02',
      title: 'Agent X Month: Build Momentum On Command',
      subtitle: 'For athletes, Agent X executes high-value work so you can focus on performance.',
      introHtml: `
        <p style="margin:0 0 16px 0;font-size:20px;line-height:1.5;color:#101722;">Hi ${firstName},</p>
        <p style="margin:0 0 16px 0;font-size:20px;line-height:1.55;color:#101722;">
          This month is about one thing: stop carrying everything yourself.
        </p>
        <p style="margin:0;font-size:18px;line-height:1.65;color:#1f2937;">
          Across ${sport}, Agent X is built to do the work athletes care about most: recruiting outreach, media planning, NIL positioning, partnership prep, and weekly execution planning. You ask once, Agent X builds the plan and next actions.
        </p>
      `,
      sectionsHtml: [
        `
          <h2 style="margin:0 0 10px 0;font-size:30px;line-height:1.15;color:#111827;font-weight:800;">Start Here: Drop In Your Links</h2>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;">
            <tr>
              <td style="background-color:#f3f7fb;border:1px solid #d8e3ef;border-left:4px solid #ccff00;border-radius:10px;padding:16px;">
                <p style="margin:0 0 6px 0;font-size:18px;line-height:1.5;color:#111827;font-weight:800;">Step 1: paste your key links once</p>
                <p style="margin:0;font-size:17px;line-height:1.6;color:#1f2937;">Add your film, social profiles, highlight links, and recruiting context so Agent X has the full picture.</p>
              </td>
            </tr>
          </table>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;margin-top:12px;">
            <tr>
              <td style="background-color:#f3f7fb;border:1px solid #d8e3ef;border-left:4px solid #ccff00;border-radius:10px;padding:16px;">
                <p style="margin:0 0 6px 0;font-size:18px;line-height:1.5;color:#111827;font-weight:800;">Step 2: let Agent X run in the background</p>
                <p style="margin:0;font-size:17px;line-height:1.6;color:#1f2937;">Agent X continuously monitors your context, researches opportunities, and executes the best next actions automatically.</p>
              </td>
            </tr>
          </table>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;margin-top:12px;">
            <tr>
              <td style="background-color:#f3f7fb;border:1px solid #d8e3ef;border-left:4px solid #ccff00;border-radius:10px;padding:16px;">
                <p style="margin:0 0 6px 0;font-size:18px;line-height:1.5;color:#111827;font-weight:800;">Step 3: approve and execute faster</p>
                <p style="margin:0;font-size:17px;line-height:1.6;color:#1f2937;">You stay in control while Agent X handles the heavy lifting across recruiting, media, NIL, and partnership workflow.</p>
              </td>
            </tr>
          </table>
        `,
        `
          <h2 style="margin:0 0 10px 0;font-size:30px;line-height:1.15;color:#111827;font-weight:800;">What Agent X Can Run For You</h2>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;">
            <tr>
              <td style="background-color:#f3f7fb;border:1px solid #d8e3ef;border-left:4px solid #ccff00;border-radius:10px;padding:16px;">
                <p style="margin:0 0 6px 0;font-size:18px;line-height:1.5;color:#111827;font-weight:800;">Recruiting execution</p>
                <p style="margin:0;font-size:17px;line-height:1.6;color:#1f2937;">Agent X drafts outreach, follow-ups, and weekly recruiting tasks so your communication stays active and organized.</p>
              </td>
            </tr>
          </table>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;margin-top:12px;">
            <tr>
              <td style="background-color:#f3f7fb;border:1px solid #d8e3ef;border-left:4px solid #ccff00;border-radius:10px;padding:16px;">
                <p style="margin:0 0 6px 0;font-size:18px;line-height:1.5;color:#111827;font-weight:800;">Media and brand output</p>
                <p style="margin:0;font-size:17px;line-height:1.6;color:#1f2937;">Agent X maps content ideas, post cadence, and highlight direction so your profile stays visible without random posting.</p>
              </td>
            </tr>
          </table>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;margin-top:12px;">
            <tr>
              <td style="background-color:#f3f7fb;border:1px solid #d8e3ef;border-left:4px solid #ccff00;border-radius:10px;padding:16px;">
                <p style="margin:0 0 6px 0;font-size:18px;line-height:1.5;color:#111827;font-weight:800;">NIL and partnership readiness</p>
                <p style="margin:0;font-size:17px;line-height:1.6;color:#1f2937;">Agent X prepares your value narrative, partnership ideas, and talking points so opportunities are easier to pursue.</p>
              </td>
            </tr>
          </table>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;margin-top:12px;">
            <tr>
              <td style="background-color:#f3f7fb;border:1px solid #d8e3ef;border-left:4px solid #ccff00;border-radius:10px;padding:16px;">
                <p style="margin:0 0 6px 0;font-size:18px;line-height:1.5;color:#111827;font-weight:800;">Weekly priority system</p>
                <p style="margin:0;font-size:17px;line-height:1.6;color:#1f2937;">Agent X turns goals into day-by-day actions so you stop guessing and start executing with consistency.</p>
              </td>
            </tr>
          </table>
        `,
        `
          <h2 style="margin:0 0 10px 0;font-size:30px;line-height:1.15;color:#111827;font-weight:800;">Athlete Campaign Visual</h2>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;">
            <tr>
              <td style="padding:0;text-align:center;">
                <img src="${ATHLETE_MOBILE_IMAGE_URL}" alt="NXT1 athlete mobile campaign visual" width="360" style="display:inline-block;width:100%;max-width:360px;height:auto;border:1px solid #d8e3ef;border-radius:12px;" />
              </td>
            </tr>
          </table>
        `,
        `
          <h2 style="margin:0 0 10px 0;font-size:30px;line-height:1.15;color:#111827;font-weight:800;">What To Ask Agent X First</h2>
          <ul style="margin:0 0 0 22px;padding:0;color:#1f2937;">
            <li style="margin:0 0 10px 0;font-size:18px;line-height:1.55;">I just added my links, monitor them and run my best recruiting and media actions automatically.</li>
            <li style="margin:0 0 10px 0;font-size:18px;line-height:1.55;">Build my 7-day recruiting execution plan and write my follow-up messages.</li>
            <li style="margin:0 0 10px 0;font-size:18px;line-height:1.55;">Create my weekly media plan with content ideas and posting priorities.</li>
            <li style="margin:0 0 10px 0;font-size:18px;line-height:1.55;">Prepare my NIL and partnership pitch outline from my profile strengths.</li>
            <li style="margin:0;font-size:18px;line-height:1.55;">Turn my current goals into daily tasks I can execute this week.</li>
          </ul>
        `,
        `
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;">
            <tr>
              <td style="background-color:rgba(204,255,0,0.08);border:1px solid rgba(204,255,0,0.22);border-left:4px solid #ccff00;border-radius:8px;padding:16px;">
                <p style="margin:0;font-size:18px;line-height:1.65;color:#111827;"><strong>Best first win:</strong> give Agent X one real athlete goal, then let it build the outreach, media, and weekly action system around it.</p>
              </td>
            </tr>
          </table>
        `,
      ],
      ctaButtons: [
        { label: 'Open Agent X', href: appUrl },
        { label: 'Help Center', href: helpUrl, variant: 'secondary' },
      ],
      footerHtml: `
        <p style="margin:0;font-size:13px;line-height:1.5;color:#b7c5d5;">© 2026 NXT1 Sports. All rights reserved.</p>
        <p style="margin:8px 0 0 0;font-size:12px;line-height:1.5;color:#8ea0b4;">You are receiving this because you are part of the NXT1 community.</p>
      `,
    }),
  };
}

function buildCoachDirectorVariant(args: {
  readonly firstName: string;
  readonly environment: RuntimeEnvironment;
  readonly primarySport?: string | null;
  readonly organizationName?: string | null;
  readonly role: 'coach' | 'director';
}): MonthlyCampaignEmailVariant {
  const appUrl = toAbsoluteAppUrl('/agent-x', { environment: args.environment });
  const sport = args.primarySport ? escapeHtml(args.primarySport) : 'your sport';
  const organizationLabel = escapeHtml(normalizeOrganizationLabel(args.organizationName));
  const firstName = escapeHtml(args.firstName);
  const roleLabel = args.role === 'director' ? 'Directors' : 'Coaches';

  return {
    subject:
      args.role === 'director'
        ? 'Directors: turn Film Review into weekly program execution'
        : "Coaches: turn Film Review into this week's game plan",
    campaignKey: `monthly_campaign_02_${args.role}`,
    html: buildMarketingEmailShell({
      preheader:
        'Agent X turns video and film review into coaching intelligence, saving staff hours every week.',
      eyebrow: 'Monthly Campaign 02',
      title: `${roleLabel} Use Agent X As A Coaching Engine`,
      subtitle:
        'Intelligence over storage: let AI break down film, build plans, and deliver decisions your staff can execute now.',
      introHtml: `
        <p style="margin:0 0 16px 0;font-size:20px;line-height:1.5;color:#101722;">Hi ${firstName},</p>
        <p style="margin:0 0 16px 0;font-size:20px;line-height:1.55;color:#101722;">
          If you lead ${organizationLabel}, Agent X should help you coach, install, and plan faster every week.
        </p>
        <p style="margin:0;font-size:18px;line-height:1.65;color:#1f2937;">
          For ${sport}, start inside Film Review and Files and let AI convert raw video into coaching intelligence: tendencies, corrections, game plans, and callsheets that save countless staff hours.
        </p>
      `,
      sectionsHtml: [
        `
          <h2 style="margin:0 0 10px 0;font-size:30px;line-height:1.15;color:#111827;font-weight:800;">What Agent X Actually Does For Staff</h2>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;">
            <tr>
              <td style="background-color:#f3f7fb;border:1px solid #d8e3ef;border-left:4px solid #ccff00;border-radius:10px;padding:16px;">
                <p style="margin:0 0 6px 0;font-size:18px;line-height:1.5;color:#111827;font-weight:800;">Turns raw film into decision-ready intelligence</p>
                <p style="margin:0;font-size:17px;line-height:1.6;color:#1f2937;">Agent X surfaces tendencies, matchup edges, and correction priorities without your staff hand-tagging every clip.</p>
              </td>
            </tr>
          </table>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;margin-top:12px;">
            <tr>
              <td style="background-color:#f3f7fb;border:1px solid #d8e3ef;border-left:4px solid #ccff00;border-radius:10px;padding:16px;">
                <p style="margin:0 0 6px 0;font-size:18px;line-height:1.5;color:#111827;font-weight:800;">Builds plans your coaches can run immediately</p>
                <p style="margin:0;font-size:17px;line-height:1.6;color:#1f2937;">From team periods to callsheets, Agent X translates video evidence into actionable weekly execution plans.</p>
              </td>
            </tr>
          </table>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;margin-top:12px;">
            <tr>
              <td style="background-color:#f3f7fb;border:1px solid #d8e3ef;border-left:4px solid #ccff00;border-radius:10px;padding:16px;">
                <p style="margin:0 0 6px 0;font-size:18px;line-height:1.5;color:#111827;font-weight:800;">Saves countless hours every week</p>
                <p style="margin:0;font-size:17px;line-height:1.6;color:#1f2937;">Less manual sorting, less context switching, fewer repetitive admin tasks, and more time coaching athletes.</p>
              </td>
            </tr>
          </table>
        `,
        `
          <h2 style="margin:0 0 10px 0;font-size:30px;line-height:1.15;color:#111827;font-weight:800;">Coach Campaign Visual</h2>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;">
            <tr>
              <td style="padding:0;text-align:center;">
                <img src="${COACH_CAMPAIGN_IMAGE_URL}" alt="NXT1 coach campaign visual" width="640" style="display:inline-block;width:100%;max-width:640px;height:auto;border:1px solid #d8e3ef;border-radius:12px;" />
              </td>
            </tr>
          </table>
        `,
        `
          <h2 style="margin:0 0 10px 0;font-size:30px;line-height:1.15;color:#111827;font-weight:800;">Film Review Prompts To Run First</h2>
          <ul style="margin:0 0 0 22px;padding:0;color:#1f2937;">
            <li style="margin:0 0 10px 0;font-size:18px;line-height:1.55;"><strong>Generate Breakdown</strong> + <strong>Analyze Breakdown</strong> for immediate tendencies.</li>
            <li style="margin:0 0 10px 0;font-size:18px;line-height:1.55;"><strong>Situation & Scenario</strong> to isolate third down, red zone, and critical moments.</li>
            <li style="margin:0 0 10px 0;font-size:18px;line-height:1.55;"><strong>Full Scout Report</strong>, <strong>Game Plan</strong>, and <strong>Adjustment Plan</strong> for opponent prep.</li>
            <li style="margin:0 0 10px 0;font-size:18px;line-height:1.55;"><strong>Callsheet</strong>, <strong>Suggest Plays</strong>, and <strong>Variations</strong> for play-calling support.</li>
            <li style="margin:0;font-size:18px;line-height:1.55;"><strong>Coaching Points</strong>, <strong>Top Fixes</strong>, and <strong>Pull Player Stats</strong> for position room teaching.</li>
          </ul>
        `,
        `
          <h2 style="margin:0 0 10px 0;font-size:30px;line-height:1.15;color:#111827;font-weight:800;">Files Panel Prompts For Weekly Operations</h2>
          <ul style="margin:0 0 0 22px;padding:0;color:#1f2937;">
            <li style="margin:0 0 10px 0;font-size:18px;line-height:1.55;"><strong>Tag Film</strong>, <strong>Find Teaching Clips</strong>, and <strong>Export Practice Clips</strong>.</li>
            <li style="margin:0 0 10px 0;font-size:18px;line-height:1.55;"><strong>Team Period Plan</strong> and <strong>Weekly Practice Schedule</strong>.</li>
            <li style="margin:0 0 10px 0;font-size:18px;line-height:1.55;"><strong>Situational Strategy</strong>, <strong>Keys to Win</strong>, and <strong>End Game Strategy</strong>.</li>
            <li style="margin:0 0 10px 0;font-size:18px;line-height:1.55;"><strong>Install Checklist</strong>, <strong>Player Evaluation</strong>, and <strong>Unit Evaluation</strong>.</li>
            <li style="margin:0;font-size:18px;line-height:1.55;"><strong>Recommendations</strong> to prioritize what the staff should execute next.</li>
          </ul>
        `,
        `
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;">
            <tr>
              <td style="background-color:rgba(204,255,0,0.08);border:1px solid rgba(204,255,0,0.22);border-left:4px solid #ccff00;border-radius:8px;padding:16px;">
                <p style="margin:0;font-size:18px;line-height:1.65;color:#111827;"><strong>Run this today:</strong> "Generate Breakdown on this opponent, pull top third-down tendencies, then build our Team Period Plan and Callsheet from selected video."</p>
              </td>
            </tr>
          </table>
        `,
      ],
      ctaButtons: [{ label: 'Open Agent X Coaching Workspace', href: appUrl }],
      footerHtml: `
        <p style="margin:0;font-size:13px;line-height:1.5;color:#b7c5d5;">© 2026 NXT1 Sports. All rights reserved.</p>
        <p style="margin:8px 0 0 0;font-size:12px;line-height:1.5;color:#8ea0b4;">You are receiving this because you are part of the NXT1 community.</p>
      `,
    }),
  };
}

function buildMonthlyCampaign02Variant(
  input: MonthlyCampaign02EmailInput
): MonthlyCampaignEmailVariant {
  const firstName = input.firstName?.trim() || DEFAULT_FIRST_NAME;

  switch (input.role) {
    case 'athlete':
      return buildAthleteVariant({
        firstName,
        environment: input.environment,
        primarySport: input.primarySport,
      });
    case 'coach':
      return buildCoachDirectorVariant({
        firstName,
        environment: input.environment,
        primarySport: input.primarySport,
        organizationName: input.organizationName,
        role: 'coach',
      });
    case 'director':
      return buildCoachDirectorVariant({
        firstName,
        environment: input.environment,
        primarySport: input.primarySport,
        organizationName: input.organizationName,
        role: 'director',
      });
    default:
      return isTeamRole(input.role)
        ? buildCoachDirectorVariant({
            firstName,
            environment: input.environment,
            primarySport: input.primarySport,
            organizationName: input.organizationName,
            role: 'coach',
          })
        : buildAthleteVariant({
            firstName,
            environment: input.environment,
            primarySport: input.primarySport,
          });
  }
}

export function buildMonthlyCampaign02Preview(
  input: MonthlyCampaign02EmailInput
): Readonly<{ subject: string; campaignKey: string; html: string }> {
  const variant = buildMonthlyCampaign02Variant(input);
  return {
    subject: variant.subject,
    campaignKey: variant.campaignKey,
    html: variant.html,
  };
}

export async function sendMonthlyCampaign02Email(
  input: MonthlyCampaign02EmailInput
): Promise<{ readonly status: 'sent'; readonly campaignKey: string; readonly email: string }> {
  const email = input.email.trim().toLowerCase();
  const variant = buildMonthlyCampaign02Variant(input);

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
      campaignKey: variant.campaignKey,
      email,
    };
  } catch (err) {
    logger.error('[MarketingEmail] Monthly campaign 02 email failed', {
      userId: input.userId,
      email,
      role: input.role,
      error: err instanceof Error ? err.message : String(err),
    });
    throw err;
  }
}
