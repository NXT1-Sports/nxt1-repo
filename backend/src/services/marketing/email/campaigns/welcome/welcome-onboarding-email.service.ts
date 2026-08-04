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
  const agentXUrl = toAbsoluteAppUrl('/agent-x', { environment: args.environment });
  const helpCenterUrl = toAbsoluteAppUrl('/help-center', { environment: args.environment });
  const safeFirstName = escapeHtml(args.firstName);
  const safeSport = args.primarySport ? escapeHtml(args.primarySport) : 'your sport';

  return {
    subject: 'Welcome to NXT1 - here is how to get started',
    campaignKey: ATHLETE_CAMPAIGN_KEY,
    html: buildMarketingEmailShell({
      preheader:
        'A quick welcome, what to do first, and a few ways to get immediate value from NXT1.',
      eyebrow: 'Welcome to NXT1',
      title: 'Your NXT1 Account Is Ready',
      subtitle: 'One place to organize your profile, your workflow, and your next move.',
      introHtml: `
        <p style="margin:0 0 16px 0;font-size:20px;line-height:1.5;color:#101722;">Hi ${safeFirstName},</p>
        <p style="margin:0 0 20px 0;font-size:18px;line-height:1.65;color:#1f2937;">
          Welcome to NXT1. We built this to be your AI digital staff, working with you to help you reach your goals,
          stay organized, and take real work off your plate.
        </p>
      `,
      sectionsHtml: [
        `
          <h2 style="margin:0 0 10px 0;font-size:30px;line-height:1.2;color:#111827;font-weight:800;">3 Things to Do First</h2>
          <ol style="margin:0 0 8px 22px;padding:0;color:#1f2937;">
            <li style="margin:0 0 12px 0;font-size:18px;line-height:1.55;"><strong>Finish your profile.</strong> Make sure the right people can understand you quickly.</li>
            <li style="margin:0 0 12px 0;font-size:18px;line-height:1.55;"><strong>Put your film and updates in one place.</strong> That gives you a clean base to work from.</li>
            <li style="margin:0;font-size:18px;line-height:1.55;"><strong>Give Agent X one real task.</strong> That is the fastest way to see what the platform can do.</li>
          </ol>
        `,
        `
          <h2 style="margin:0 0 10px 0;font-size:30px;line-height:1.2;color:#111827;font-weight:800;">Example Prompts and Flows</h2>
          <p style="margin:0 0 12px 0;font-size:18px;line-height:1.65;color:#1f2937;">
            Here are a few simple ways to get immediate value.
          </p>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:separate;border-spacing:0 12px;">
            <tr>
              <td style="background-color:#f7f9fc;border:1px solid #d8e0ea;border-radius:8px;padding:16px;">
                <p style="margin:0 0 6px 0;font-size:17px;line-height:1.5;color:#111827;font-weight:700;">Prompt 1</p>
                <p style="margin:0 0 8px 0;font-size:16px;line-height:1.55;color:#1f2937;">“Build my weekly action plan for ${safeSport}, including training, communication follow-up, and my top priorities.”</p>
                <p style="margin:0;font-size:15px;line-height:1.55;color:#4b5563;">Flow: Agent X turns your goals into a simple plan you can actually follow.</p>
              </td>
            </tr>
            <tr>
              <td style="background-color:#f7f9fc;border:1px solid #d8e0ea;border-radius:8px;padding:16px;">
                <p style="margin:0 0 6px 0;font-size:17px;line-height:1.5;color:#111827;font-weight:700;">Prompt 2</p>
                <p style="margin:0 0 8px 0;font-size:16px;line-height:1.55;color:#1f2937;">“Help me write a strong follow-up message after a camp, event, or conversation with a coach.”</p>
                <p style="margin:0;font-size:15px;line-height:1.55;color:#4b5563;">Flow: Agent X helps you tighten the message and make sure the follow-up is worth sending.</p>
              </td>
            </tr>
            <tr>
              <td style="background-color:#f7f9fc;border:1px solid #d8e0ea;border-radius:8px;padding:16px;">
                <p style="margin:0 0 6px 0;font-size:17px;line-height:1.5;color:#111827;font-weight:700;">Prompt 3</p>
                <p style="margin:0 0 8px 0;font-size:16px;line-height:1.55;color:#1f2937;">“Turn my latest performance update into a clean summary I can use in my profile and outreach.”</p>
                <p style="margin:0;font-size:15px;line-height:1.55;color:#4b5563;">Flow: One update becomes usable profile copy and better communication material.</p>
              </td>
            </tr>
          </table>
        `,
        `
          <h2 style="margin:0 0 10px 0;font-size:30px;line-height:1.2;color:#111827;font-weight:800;">What to Expect Next</h2>
          <p style="margin:0 0 12px 0;font-size:18px;line-height:1.65;color:#1f2937;">
            The biggest mistake is waiting too long to use it. Start with your profile, give Agent X something real to work on,
            and you will see the value much faster.
          </p>
          <p style="margin:0;font-size:18px;line-height:1.65;color:#1f2937;">
            We are glad to have you here. If you need help getting set up, our team is ready.
          </p>
        `,
      ],
      ctaButtons: [
        { label: 'Open Agent X', href: agentXUrl },
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
  const agentXUrl = toAbsoluteAppUrl('/agent-x', { environment: args.environment });
  const helpCenterUrl = toAbsoluteAppUrl('/help-center', { environment: args.environment });
  const safeFirstName = escapeHtml(args.firstName);
  const safeSport = args.primarySport ? escapeHtml(args.primarySport) : 'your sport';
  const safeOrganization = args.organizationName
    ? escapeHtml(args.organizationName)
    : 'your program';

  return {
    subject: 'Welcome to NXT1 - here is how to launch your program',
    campaignKey: TEAM_CAMPAIGN_KEY,
    html: buildMarketingEmailShell({
      preheader:
        'A quick welcome, what to set up first, and a few ways your staff can get immediate value from NXT1.',
      eyebrow: 'Welcome to NXT1',
      title: 'Your Program Is Ready to Launch on NXT1',
      subtitle: 'A better way to handle the work around your team, not just the work on the field.',
      introHtml: `
        <p style="margin:0 0 16px 0;font-size:20px;line-height:1.5;color:#101722;">Hi ${safeFirstName},</p>
        <p style="margin:0 0 20px 0;font-size:18px;line-height:1.65;color:#1f2937;">
          Welcome to NXT1. We built this to be an AI digital staff for programs like ${safeOrganization},
          working alongside your coaches and staff to help you hit your goals and take repetitive work off your plate.
        </p>
        <p style="margin:0 0 20px 0;font-size:18px;line-height:1.65;color:#1f2937;">
          From planning and communication to recruiting, film support, scouting prep, and day-to-day operations across ${safeSport},
          NXT1 is built to help your staff stay organized, move faster, and spend more time on the work that actually impacts winning.
        </p>
      `,
      sectionsHtml: [
        `
          <h2 style="margin:0 0 10px 0;font-size:30px;line-height:1.2;color:#111827;font-weight:800;">3 Things to Do First</h2>
          <ol style="margin:0 0 8px 22px;padding:0;color:#1f2937;">
            <li style="margin:0 0 12px 0;font-size:18px;line-height:1.55;"><strong>Confirm your program setup.</strong> Get your team and staff context in place first.</li>
            <li style="margin:0 0 12px 0;font-size:18px;line-height:1.55;"><strong>Bring your core information into one place.</strong> That gives your staff a cleaner operating base.</li>
            <li style="margin:0;font-size:18px;line-height:1.55;"><strong>Run one workflow through Agent X.</strong> Start with something your staff already needs done this week.</li>
          </ol>
        `,
        `
          <h2 style="margin:0 0 10px 0;font-size:30px;line-height:1.2;color:#111827;font-weight:800;">Example Prompts and Flows</h2>
          <p style="margin:0 0 12px 0;font-size:18px;line-height:1.65;color:#1f2937;">
            Here are a few simple ways to see it in action.
          </p>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:separate;border-spacing:0 12px;">
            <tr>
              <td style="background-color:#f7f9fc;border:1px solid #d8e0ea;border-radius:8px;padding:16px;">
                <p style="margin:0 0 6px 0;font-size:17px;line-height:1.5;color:#111827;font-weight:700;">Prompt 1</p>
                <p style="margin:0 0 8px 0;font-size:16px;line-height:1.55;color:#1f2937;">“Build this week’s operations plan for ${safeOrganization}, including staff priorities, scheduling, and follow-up.”</p>
                <p style="margin:0;font-size:15px;line-height:1.55;color:#4b5563;">Flow: Agent X turns a broad need into a plan your staff can use right away.</p>
              </td>
            </tr>
            <tr>
              <td style="background-color:#f7f9fc;border:1px solid #d8e0ea;border-radius:8px;padding:16px;">
                <p style="margin:0 0 6px 0;font-size:17px;line-height:1.5;color:#111827;font-weight:700;">Prompt 2</p>
                <p style="margin:0 0 8px 0;font-size:16px;line-height:1.55;color:#1f2937;">“Create a recruiting follow-up workflow for our current prospect group, including messaging and next steps.”</p>
                <p style="margin:0;font-size:15px;line-height:1.55;color:#4b5563;">Flow: Agent X helps structure the communication and keeps the process moving.</p>
              </td>
            </tr>
            <tr>
              <td style="background-color:#f7f9fc;border:1px solid #d8e0ea;border-radius:8px;padding:16px;">
                <p style="margin:0 0 6px 0;font-size:17px;line-height:1.5;color:#111827;font-weight:700;">Prompt 3</p>
                <p style="margin:0 0 8px 0;font-size:16px;line-height:1.55;color:#1f2937;">“Draft a clean update for players, parents, or staff based on this week’s schedule and priorities.”</p>
                <p style="margin:0;font-size:15px;line-height:1.55;color:#4b5563;">Flow: One internal update becomes communication your program can send quickly.</p>
              </td>
            </tr>
          </table>
        `,
        `
          <h2 style="margin:0 0 10px 0;font-size:30px;line-height:1.2;color:#111827;font-weight:800;">What to Expect Next</h2>
          <p style="margin:0 0 12px 0;font-size:18px;line-height:1.65;color:#1f2937;">
            The quickest way to see the value is to use it on real work right away. Start with one staff workflow,
            one communication task, or one planning need and build from there.
          </p>
          <p style="margin:0;font-size:18px;line-height:1.65;color:#1f2937;">
            We are excited to have you here, and we are ready to help if you want support getting your first workflows in place.
          </p>
        `,
      ],
      ctaButtons: [
        { label: 'Open Agent X', href: agentXUrl },
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
