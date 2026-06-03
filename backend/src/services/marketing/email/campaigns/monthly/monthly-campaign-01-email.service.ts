/**
 * @fileoverview Monthly Campaign 01 Marketing Email
 * @module @nxt1/backend/services/marketing/email/campaigns/monthly/monthly-campaign-01-email
 *
 * Role-based monthly campaign focused on the new NXT1 platform and Agent X.
 */

import type { UserRole } from '@nxt1/core';
import { isTeamRole } from '@nxt1/core';
import { sendOutboundMarketingEmail } from '../../outbound-email.service.js';
import { logger } from '../../../../../utils/logger.js';
import { toAbsoluteAppUrl } from '../../../../../utils/app-url.js';
import type { RuntimeEnvironment } from '../../../../../config/runtime-environment.js';
import { buildMarketingEmailShell } from '../../templates/marketing-email-shell.js';

const DEFAULT_FIRST_NAME = 'NXT1 Member';

interface MonthlyCampaign01EmailInput {
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
    subject: 'Athletes are moving different with the new NXT1 + Agent X',
    campaignKey: 'monthly_campaign_01_athlete',
    html: buildMarketingEmailShell({
      preheader:
        'The new NXT1 platform turns Agent X into your daily execution engine for planning, content, communication, and performance.',
      eyebrow: 'Monthly Campaign 01',
      title: 'This Is Not Another Athlete Profile Platform',
      subtitle: 'The new NXT1 gives athletes a command center. Agent X gives them execution.',
      introHtml: `
        <p style="margin:0 0 16px 0;font-size:20px;line-height:1.5;color:#101722;">Hi ${firstName},</p>
        <p style="margin:0 0 16px 0;font-size:20px;line-height:1.55;color:#101722;">
          The new NXT1 platform was built for athletes who are done playing small.
        </p>
        <p style="margin:0;font-size:18px;line-height:1.65;color:#1f2937;">
          Instead of just holding your profile, NXT1 helps you operate. Agent X helps you turn ambition into output across ${sport}, communication, creative, preparation, and daily execution.
        </p>
      `,
      sectionsHtml: [
        `
          <h2 style="margin:0 0 10px 0;font-size:30px;line-height:1.15;color:#111827;font-weight:800;">Why Athletes Click With It</h2>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;">
            <tr><td style="background-color:#f3f7fb;border:1px solid #d8e3ef;border-left:4px solid #ccff00;border-radius:10px;padding:16px;">
              <p style="margin:0 0 6px 0;font-size:18px;line-height:1.5;color:#111827;font-weight:800;">Daily direction without the guesswork</p>
              <p style="margin:0;font-size:17px;line-height:1.6;color:#1f2937;">Use Agent X to sharpen your next move, clean up your presentation, and stay consistent with intention instead of relying on scattered effort.</p>
            </td></tr>
          </table>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;margin-top:12px;">
            <tr><td style="background-color:#f3f7fb;border:1px solid #d8e3ef;border-left:4px solid #ccff00;border-radius:10px;padding:16px;">
              <p style="margin:0 0 6px 0;font-size:18px;line-height:1.5;color:#111827;font-weight:800;">Elite creative and communication in one place</p>
              <p style="margin:0;font-size:17px;line-height:1.6;color:#1f2937;">Generate graphics, refine outreach, organize updates, and create a stronger athlete brand without needing a full staff behind you.</p>
            </td></tr>
          </table>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;margin-top:12px;">
            <tr><td style="background-color:#f3f7fb;border:1px solid #d8e3ef;border-left:4px solid #ccff00;border-radius:10px;padding:16px;">
              <p style="margin:0 0 6px 0;font-size:18px;line-height:1.5;color:#111827;font-weight:800;">A real command center for daily momentum</p>
              <p style="margin:0;font-size:17px;line-height:1.6;color:#1f2937;">Your next priorities, tasks, and opportunities live in one place so you can move faster than athletes who are still juggling scattered tools.</p>
            </td></tr>
          </table>
        `,
        `
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;">
            <tr>
              <td style="background-color:rgba(204,255,0,0.08);border:1px solid rgba(204,255,0,0.22);border-left:4px solid #ccff00;border-radius:8px;padding:16px;">
                <p style="margin:0;font-size:18px;line-height:1.65;color:#111827;"><strong>Elite athletes do not wait for momentum.</strong> They create it. NXT1 and Agent X were built to help you do that on command.</p>
              </td>
            </tr>
          </table>
        `,
        `
          <h2 style="margin:0 0 10px 0;font-size:30px;line-height:1.15;color:#111827;font-weight:800;">Open It With Purpose</h2>
          <p style="margin:0 0 12px 0;font-size:18px;line-height:1.65;color:#1f2937;">Do not just log in and browse. Open Agent X and tell it what you need next.</p>
          <ul style="margin:0 0 0 22px;padding:0;color:#1f2937;">
            <li style="margin:0 0 10px 0;font-size:18px;line-height:1.55;">Build my weekly execution plan</li>
            <li style="margin:0 0 10px 0;font-size:18px;line-height:1.55;">Help me improve my athlete profile and outreach</li>
            <li style="margin:0;font-size:18px;line-height:1.55;">Create content that makes coaches pay attention</li>
          </ul>
        `,
      ],
      ctaButtons: [
        { label: 'Open Agent X Now', href: appUrl },
        { label: 'See Help Center', href: helpUrl, variant: 'secondary' },
      ],
      footerHtml: `
        <p style="margin:0;font-size:13px;line-height:1.5;color:#b7c5d5;">© 2026 NXT1 Sports. All rights reserved.</p>
        <p style="margin:8px 0 0 0;font-size:12px;line-height:1.5;color:#8ea0b4;">You are receiving this because you are part of the NXT1 community.</p>
      `,
    }),
  };
}

function buildCoachVariant(args: {
  readonly firstName: string;
  readonly environment: RuntimeEnvironment;
  readonly primarySport?: string | null;
  readonly organizationName?: string | null;
}): MonthlyCampaignEmailVariant {
  const appUrl = toAbsoluteAppUrl('/agent-x', { environment: args.environment });
  const teamUrl = toAbsoluteAppUrl('/team', { environment: args.environment });
  const sport = args.primarySport ? escapeHtml(args.primarySport) : 'your sport';
  const organizationName = args.organizationName
    ? escapeHtml(args.organizationName)
    : 'your program';
  const firstName = escapeHtml(args.firstName);

  return {
    subject: 'Coaches are using the new NXT1 to operate faster with Agent X',
    campaignKey: 'monthly_campaign_01_coach',
    html: buildMarketingEmailShell({
      preheader:
        'The new NXT1 platform gives coaches an elite command layer for planning, team visibility, communication, and execution.',
      eyebrow: 'Monthly Campaign 01',
      title: 'Coach With A Command Center, Not A Mess Of Tabs',
      subtitle:
        'The new NXT1 platform helps coaches execute with more speed, structure, and leverage.',
      introHtml: `
        <p style="margin:0 0 16px 0;font-size:20px;line-height:1.5;color:#101722;">Hi ${firstName},</p>
        <p style="margin:0 0 16px 0;font-size:20px;line-height:1.55;color:#101722;">
          The new NXT1 platform was built for coaches who want to run ${organizationName} like an elite operation.
        </p>
        <p style="margin:0;font-size:18px;line-height:1.65;color:#1f2937;">
          Agent X is not a novelty layer. It is an execution engine that helps you organize priorities, tighten communication, and move faster across ${sport}, athlete development, team operations, and daily staff work.
        </p>
      `,
      sectionsHtml: [
        `
          <h2 style="margin:0 0 10px 0;font-size:30px;line-height:1.15;color:#111827;font-weight:800;">What Coaches Get Immediately</h2>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;">
            <tr><td style="background-color:#f3f7fb;border:1px solid #d8e3ef;border-left:4px solid #ccff00;border-radius:10px;padding:16px;">
              <p style="margin:0 0 6px 0;font-size:18px;line-height:1.5;color:#111827;font-weight:800;">A tighter team and athlete workflow</p>
              <p style="margin:0;font-size:17px;line-height:1.6;color:#1f2937;">Get one place to organize priorities, see athlete context, and keep your next moves clear instead of buried under noise.</p>
            </td></tr>
          </table>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;margin-top:12px;">
            <tr><td style="background-color:#f3f7fb;border:1px solid #d8e3ef;border-left:4px solid #ccff00;border-radius:10px;padding:16px;">
              <p style="margin:0 0 6px 0;font-size:18px;line-height:1.5;color:#111827;font-weight:800;">Agent X as an operations multiplier</p>
              <p style="margin:0;font-size:17px;line-height:1.6;color:#1f2937;">Use Agent X to draft outreach, structure plans, prepare staff communication, and move administrative work out of your head and into a real system.</p>
            </td></tr>
          </table>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;margin-top:12px;">
            <tr><td style="background-color:#f3f7fb;border:1px solid #d8e3ef;border-left:4px solid #ccff00;border-radius:10px;padding:16px;">
              <p style="margin:0 0 6px 0;font-size:18px;line-height:1.5;color:#111827;font-weight:800;">Better output without adding staff overhead</p>
              <p style="margin:0;font-size:17px;line-height:1.6;color:#1f2937;">Build graphics, briefs, summaries, workflows, and decision support from one platform instead of stitching together multiple disconnected tools.</p>
            </td></tr>
          </table>
        `,
        `
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;">
            <tr>
              <td style="background-color:rgba(204,255,0,0.08);border:1px solid rgba(204,255,0,0.22);border-left:4px solid #ccff00;border-radius:8px;padding:16px;">
                <p style="margin:0;font-size:18px;line-height:1.65;color:#111827;"><strong>Elite coaches protect clarity.</strong> The new NXT1 helps you keep decisions, communication, and execution in one place.</p>
              </td>
            </tr>
          </table>
        `,
        `
          <h2 style="margin:0 0 10px 0;font-size:30px;line-height:1.15;color:#111827;font-weight:800;">Best First Move</h2>
          <p style="margin:0 0 12px 0;font-size:18px;line-height:1.65;color:#1f2937;">Open Agent X and give it a real coaching instruction.</p>
          <ul style="margin:0 0 0 22px;padding:0;color:#1f2937;">
            <li style="margin:0 0 10px 0;font-size:18px;line-height:1.55;">Help me organize this week’s team priorities</li>
            <li style="margin:0 0 10px 0;font-size:18px;line-height:1.55;">Build a communication plan for our program</li>
            <li style="margin:0;font-size:18px;line-height:1.55;">Turn our workflow into something more efficient</li>
          </ul>
        `,
      ],
      ctaButtons: [
        { label: 'Open Agent X For Coaches', href: appUrl },
        { label: 'Open Team Workspace', href: teamUrl, variant: 'secondary' },
      ],
      footerHtml: `
        <p style="margin:0;font-size:13px;line-height:1.5;color:#b7c5d5;">© 2026 NXT1 Sports. All rights reserved.</p>
        <p style="margin:8px 0 0 0;font-size:12px;line-height:1.5;color:#8ea0b4;">You are receiving this because you are part of the NXT1 community.</p>
      `,
    }),
  };
}

function buildDirectorVariant(args: {
  readonly firstName: string;
  readonly environment: RuntimeEnvironment;
  readonly primarySport?: string | null;
  readonly organizationName?: string | null;
}): MonthlyCampaignEmailVariant {
  const appUrl = toAbsoluteAppUrl('/agent-x', { environment: args.environment });
  const teamUrl = toAbsoluteAppUrl('/team', { environment: args.environment });
  const organizationName = args.organizationName
    ? escapeHtml(args.organizationName)
    : 'your athletic department';
  const sport = args.primarySport ? escapeHtml(args.primarySport) : 'your program';
  const firstName = escapeHtml(args.firstName);

  return {
    subject: 'Directors are using the new NXT1 + Agent X to run sharper programs',
    campaignKey: 'monthly_campaign_01_director',
    html: buildMarketingEmailShell({
      preheader:
        'The new NXT1 platform gives directors an elite system for visibility, coordination, communication, and execution at program scale.',
      eyebrow: 'Monthly Campaign 01',
      title: 'Run The Program Like A Modern Sports Enterprise',
      subtitle: 'The new NXT1 platform and Agent X give directors structure, leverage, and speed.',
      introHtml: `
        <p style="margin:0 0 16px 0;font-size:20px;line-height:1.5;color:#101722;">Hi ${firstName},</p>
        <p style="margin:0 0 16px 0;font-size:20px;line-height:1.55;color:#101722;">
          The new NXT1 platform was built for leaders responsible for the quality of the entire operation.
        </p>
        <p style="margin:0;font-size:18px;line-height:1.65;color:#1f2937;">
          If you are leading ${organizationName}, Agent X gives you a more powerful way to manage visibility, communication, workflow, and execution across ${sport} without operating like it is still 2019.
        </p>
      `,
      sectionsHtml: [
        `
          <h2 style="margin:0 0 10px 0;font-size:30px;line-height:1.15;color:#111827;font-weight:800;">Why Directors Lean In</h2>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;">
            <tr><td style="background-color:#f3f7fb;border:1px solid #d8e3ef;border-left:4px solid #ccff00;border-radius:10px;padding:16px;">
              <p style="margin:0 0 6px 0;font-size:18px;line-height:1.5;color:#111827;font-weight:800;">One command layer for the program</p>
              <p style="margin:0;font-size:17px;line-height:1.6;color:#1f2937;">NXT1 helps you centralize what matters so key decisions, staff workflows, and athlete-facing execution stop getting fragmented across disconnected systems.</p>
            </td></tr>
          </table>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;margin-top:12px;">
            <tr><td style="background-color:#f3f7fb;border:1px solid #d8e3ef;border-left:4px solid #ccff00;border-radius:10px;padding:16px;">
              <p style="margin:0 0 6px 0;font-size:18px;line-height:1.5;color:#111827;font-weight:800;">Agent X as a leverage engine</p>
              <p style="margin:0;font-size:17px;line-height:1.6;color:#1f2937;">Use Agent X to accelerate communications, generate assets, structure workflows, and keep initiatives moving without depending on manual follow-up for everything.</p>
            </td></tr>
          </table>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;margin-top:12px;">
            <tr><td style="background-color:#f3f7fb;border:1px solid #d8e3ef;border-left:4px solid #ccff00;border-radius:10px;padding:16px;">
              <p style="margin:0 0 6px 0;font-size:18px;line-height:1.5;color:#111827;font-weight:800;">A platform that reflects elite standards</p>
              <p style="margin:0;font-size:17px;line-height:1.6;color:#1f2937;">The goal is not more software. The goal is a sharper organization that communicates better, operates cleaner, and moves faster at every level.</p>
            </td></tr>
          </table>
        `,
        `
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;">
            <tr>
              <td style="background-color:rgba(204,255,0,0.08);border:1px solid rgba(204,255,0,0.22);border-left:4px solid #ccff00;border-radius:8px;padding:16px;">
                <p style="margin:0;font-size:18px;line-height:1.65;color:#111827;"><strong>Elite directors do not just oversee.</strong> They orchestrate. NXT1 and Agent X were built to help you do that with precision.</p>
              </td>
            </tr>
          </table>
        `,
        `
          <h2 style="margin:0 0 10px 0;font-size:30px;line-height:1.15;color:#111827;font-weight:800;">Your Next Step</h2>
          <p style="margin:0 0 12px 0;font-size:18px;line-height:1.65;color:#1f2937;">Open Agent X and use it like a real operator.</p>
          <ul style="margin:0 0 0 22px;padding:0;color:#1f2937;">
            <li style="margin:0 0 10px 0;font-size:18px;line-height:1.55;">Show me how to make our program run more efficiently</li>
            <li style="margin:0 0 10px 0;font-size:18px;line-height:1.55;">Build a smarter communication strategy for our staff and athletes</li>
            <li style="margin:0;font-size:18px;line-height:1.55;">Help me use NXT1 as a true operating system for our organization</li>
          </ul>
        `,
      ],
      ctaButtons: [
        { label: 'Open Agent X For Leadership', href: appUrl },
        { label: 'Open Program Workspace', href: teamUrl, variant: 'secondary' },
      ],
      footerHtml: `
        <p style="margin:0;font-size:13px;line-height:1.5;color:#b7c5d5;">© 2026 NXT1 Sports. All rights reserved.</p>
        <p style="margin:8px 0 0 0;font-size:12px;line-height:1.5;color:#8ea0b4;">You are receiving this because you are part of the NXT1 community.</p>
      `,
    }),
  };
}

function buildMonthlyCampaign01Variant(
  input: MonthlyCampaign01EmailInput
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

export async function sendMonthlyCampaign01Email(
  input: MonthlyCampaign01EmailInput
): Promise<{ readonly status: 'sent'; readonly campaignKey: string; readonly email: string }> {
  const email = input.email.trim().toLowerCase();
  const variant = buildMonthlyCampaign01Variant(input);

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
    logger.error('[MarketingEmail] Monthly campaign 01 email failed', {
      userId: input.userId,
      email,
      role: input.role,
      error: err instanceof Error ? err.message : String(err),
    });
    throw err;
  }
}
