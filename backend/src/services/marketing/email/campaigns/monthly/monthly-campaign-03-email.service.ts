/**
 * @fileoverview Monthly Campaign 03 Marketing Email
 * @module @nxt1/backend/services/marketing/email/campaigns/monthly/monthly-campaign-03-email
 *
 * Plain, role-based monthly campaign using regular email formatting.
 */

import type { UserRole } from '@nxt1/core';
import { isTeamRole } from '@nxt1/core';
import { sendOutboundMarketingEmail } from '../../outbound-email.service.js';
import { logger } from '../../../../../utils/logger.js';
import { toAbsoluteAppUrl } from '../../../../../utils/app-url.js';
import type { RuntimeEnvironment } from '../../../../../config/runtime-environment.js';

const DEFAULT_FIRST_NAME = 'NXT1 Member';

interface MonthlyCampaign03EmailInput {
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

function buildPlainDocument(subject: string, lines: readonly string[]): string {
  const paragraphs = lines.map((line) => `<p>${line}</p>`).join('\n');

  return [
    '<!doctype html>',
    '<html>',
    '<head>',
    '<meta charset="UTF-8" />',
    `<title>${escapeHtml(subject)}</title>`,
    '</head>',
    '<body>',
    paragraphs,
    '<p>— NXT1 Team</p>',
    '<p>support@nxt1sports.com</p>',
    '</body>',
    '</html>',
  ].join('\n');
}

function buildAthleteVariant(args: {
  readonly firstName: string;
  readonly environment: RuntimeEnvironment;
  readonly primarySport?: string | null;
}): MonthlyCampaignEmailVariant {
  const sport = args.primarySport ? escapeHtml(args.primarySport) : 'your sport';
  const firstName = escapeHtml(args.firstName);
  const agentUrl = toAbsoluteAppUrl('/agent-x', { environment: args.environment });
  const profileUrl = toAbsoluteAppUrl('/profile', { environment: args.environment });

  const subject = 'August Elite Execution Plan: Athletes';

  return {
    subject,
    campaignKey: 'monthly_campaign_03_athlete',
    html: buildPlainDocument(subject, [
      `Hi ${firstName},`,
      'This month is about elite execution, not random effort.',
      `For ${sport}, Agent X can now run your weekly structure across recruiting communication, content planning, and priority sequencing so your output stays consistent.`,
      'Use this 3-step play today:',
      '1) Open Agent X and set one clear monthly objective.',
      '2) Ask for a 7-day execution plan with daily actions.',
      '3) Ask Agent X to draft your recruiting follow-ups and content calendar for the week.',
      `Open Agent X: ${escapeHtml(agentUrl)}`,
      `Review your profile and positioning: ${escapeHtml(profileUrl)}`,
      'Elite athletes separate because they execute every week, not once in a while.',
    ]),
  };
}

function buildCoachVariant(args: {
  readonly firstName: string;
  readonly environment: RuntimeEnvironment;
  readonly primarySport?: string | null;
  readonly organizationName?: string | null;
}): MonthlyCampaignEmailVariant {
  const firstName = escapeHtml(args.firstName);
  const sport = args.primarySport ? escapeHtml(args.primarySport) : 'your sport';
  const organizationName = args.organizationName
    ? escapeHtml(args.organizationName)
    : 'your program';
  const agentUrl = toAbsoluteAppUrl('/agent-x', { environment: args.environment });
  const teamUrl = toAbsoluteAppUrl('/team', { environment: args.environment });

  const subject = 'August Elite Execution Plan: Coaches';

  return {
    subject,
    campaignKey: 'monthly_campaign_03_coach',
    html: buildPlainDocument(subject, [
      `Hi ${firstName},`,
      `This month, the goal is to help ${organizationName} operate faster with less staff friction.`,
      `For ${sport}, Agent X is strongest when you use it to convert film and planning into weekly execution your staff can run immediately.`,
      'Use this 3-step play today:',
      '1) Ask Agent X for your top 5 priorities this week.',
      '2) Ask for a team period plan and callsheet framework from your current context.',
      '3) Ask for coaching points and corrective priorities by position group.',
      `Open Agent X: ${escapeHtml(agentUrl)}`,
      `Open Team Workspace: ${escapeHtml(teamUrl)}`,
      'Elite coaching programs win by reducing noise and improving decision speed weekly.',
    ]),
  };
}

function buildDirectorVariant(args: {
  readonly firstName: string;
  readonly environment: RuntimeEnvironment;
  readonly primarySport?: string | null;
  readonly organizationName?: string | null;
}): MonthlyCampaignEmailVariant {
  const firstName = escapeHtml(args.firstName);
  const sport = args.primarySport ? escapeHtml(args.primarySport) : 'your program';
  const organizationName = args.organizationName
    ? escapeHtml(args.organizationName)
    : 'your athletic organization';
  const agentUrl = toAbsoluteAppUrl('/agent-x', { environment: args.environment });
  const teamUrl = toAbsoluteAppUrl('/team', { environment: args.environment });

  const subject = 'August Elite Execution Plan: Directors';

  return {
    subject,
    campaignKey: 'monthly_campaign_03_director',
    html: buildPlainDocument(subject, [
      `Hi ${firstName},`,
      `This month, NXT1 is focused on helping leaders run ${organizationName} with elite operational clarity.`,
      `Across ${sport}, Agent X can help centralize planning, communications, and execution so your teams spend less time coordinating and more time producing outcomes.`,
      'Use this 3-step play today:',
      '1) Ask Agent X for a monthly operational priorities brief.',
      '2) Ask for a weekly execution cadence for staff and athlete-facing work.',
      '3) Ask for a communication rhythm to align coaches, athletes, and leadership.',
      `Open Agent X: ${escapeHtml(agentUrl)}`,
      `Open Team Workspace: ${escapeHtml(teamUrl)}`,
      'Elite organizations compound because leadership enforces clarity and cadence every week.',
    ]),
  };
}

function buildMonthlyCampaign03Variant(
  input: MonthlyCampaign03EmailInput
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
      return buildCoachVariant({
        firstName,
        environment: input.environment,
        primarySport: input.primarySport,
        organizationName: input.organizationName,
      });
    case 'director':
      return buildDirectorVariant({
        firstName,
        environment: input.environment,
        primarySport: input.primarySport,
        organizationName: input.organizationName,
      });
    default:
      return isTeamRole(input.role)
        ? buildCoachVariant({
            firstName,
            environment: input.environment,
            primarySport: input.primarySport,
            organizationName: input.organizationName,
          })
        : buildAthleteVariant({
            firstName,
            environment: input.environment,
            primarySport: input.primarySport,
          });
  }
}

export function buildMonthlyCampaign03Preview(
  input: MonthlyCampaign03EmailInput
): Readonly<{ subject: string; campaignKey: string; html: string }> {
  const variant = buildMonthlyCampaign03Variant(input);
  return {
    subject: variant.subject,
    campaignKey: variant.campaignKey,
    html: variant.html,
  };
}

export async function sendMonthlyCampaign03Email(
  input: MonthlyCampaign03EmailInput
): Promise<{ readonly status: 'sent'; readonly campaignKey: string; readonly email: string }> {
  const email = input.email.trim().toLowerCase();
  const variant = buildMonthlyCampaign03Variant(input);

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
    logger.error('[MarketingEmail] Monthly campaign 03 email failed', {
      userId: input.userId,
      email,
      role: input.role,
      error: err instanceof Error ? err.message : String(err),
    });
    throw err;
  }
}
