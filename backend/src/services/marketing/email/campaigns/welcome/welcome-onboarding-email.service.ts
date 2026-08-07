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

function getSportSurface(primarySport?: string | null): string {
  const sport = (primarySport ?? '').toLowerCase();
  if (
    sport.includes('basketball') ||
    sport.includes('volleyball') ||
    sport.includes('tennis') ||
    sport.includes('badminton')
  ) {
    return 'on the court';
  }
  if (sport.includes('ice hockey') || sport.includes('skating') || sport.includes('hockey')) {
    return 'on the ice';
  }
  if (sport.includes('wrestling') || sport.includes('gymnastics')) {
    return 'on the mat';
  }
  if (sport.includes('swimming') || sport.includes('water polo')) {
    return 'in the pool';
  }
  if (sport.includes('track') || sport.includes('cross country') || sport.includes('running')) {
    return 'on the track';
  }
  if (sport.includes('golf')) {
    return 'on the course';
  }
  if (
    sport.includes('football') ||
    sport.includes('soccer') ||
    sport.includes('baseball') ||
    sport.includes('softball') ||
    sport.includes('lacrosse') ||
    sport.includes('field hockey') ||
    sport.includes('rugby')
  ) {
    return 'on the field';
  }
  return 'on the field or court';
}

function buildAthleteWelcomeEmail(args: {
  readonly firstName: string;
  readonly environment: RuntimeEnvironment;
  readonly primarySport?: string | null;
}): { readonly subject: string; readonly html: string; readonly campaignKey: string } {
  const agentXUrl = toAbsoluteAppUrl('/agent-x', { environment: args.environment });
  const profileUrl = toAbsoluteAppUrl('/profile', { environment: args.environment });
  const safeFirstName = escapeHtml(args.firstName);
  const safeSport = args.primarySport ? escapeHtml(args.primarySport) : 'your sport';
  const surface = getSportSurface(args.primarySport);

  return {
    subject: 'Welcome to NXT1: Your Team of AI Coordinators is Live',
    campaignKey: ATHLETE_CAMPAIGN_KEY,
    html: buildMarketingEmailShell({
      preheader:
        'Welcome to NXT1! You now have a team of AI coordinators ready to handle anything you need across performance, recruiting, media, and team ops.',
      eyebrow: 'Welcome to NXT1',
      title: 'Welcome to NXT1',
      subtitle: 'Your personal team of AI coordinators is officially active.',
      introHtml: `
        <p style="margin:0 0 16px 0;font-size:20px;line-height:1.5;color:#101722;">Hi ${safeFirstName},</p>
        <p style="margin:0 0 20px 0;font-size:18px;line-height:1.65;color:#1f2937;">
          Welcome to NXT1! You now have a full team of AI coordinators ready to take on anything you need across ${safeSport}. NXT1 is built to work for you 24/7 so you can focus on executing ${surface}.
        </p>
      `,
      sectionsHtml: [
        `
          <h2 style="margin:0 0 12px 0;font-size:26px;line-height:1.2;color:#111827;font-weight:800;">How Your Team of AI Coordinators Works</h2>
          <ul style="margin:0 0 12px 22px;padding:0;color:#1f2937;">
            <li style="margin:0 0 10px 0;font-size:17px;line-height:1.55;"><strong>Ask Across Key Domains:</strong> Just ask anything across performance, recruiting, media, coaching, and team ops: Agent X handles the heavy lifting.</li>
            <li style="margin:0 0 10px 0;font-size:17px;line-height:1.55;"><strong>Runs in the Background:</strong> Agent X executes tasks autonomously in the background and pings you the second your deliverable is ready.</li>
            <li style="margin:0 0 10px 0;font-size:17px;line-height:1.55;"><strong>Use Quick Actions & Prompts:</strong> Access 1-click coordinator prompts for immediate outputs without typing long requests.</li>
            <li style="margin:0;font-size:17px;line-height:1.55;"><strong>Set Recurring Schedules:</strong> Put tasks on automated recurring schedules so Agent X delivers weekly and monthly updates automatically.</li>
          </ul>
        `,
        `
          <h2 style="margin:0 0 12px 0;font-size:26px;line-height:1.2;color:#111827;font-weight:800;">⚡ What Agent X Can Do for You (Skills List)</h2>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:separate;border-spacing:0 8px;">
            <tr>
              <td style="background-color:#f7f9fc;border:1px solid #d8e0ea;border-radius:8px;padding:12px 16px;">
                <strong style="font-size:16px;color:#111827;">🎬 Film Breakdown & Motion Analysis:</strong>
                <span style="font-size:15px;color:#4b5563;"> Extract key clips, identify tendencies, and analyze technique.</span>
              </td>
            </tr>
            <tr>
              <td style="background-color:#f7f9fc;border:1px solid #d8e0ea;border-radius:8px;padding:12px 16px;">
                <strong style="font-size:16px;color:#111827;">🎨 Custom Highlight Reel & Social Graphic Studio:</strong>
                <span style="font-size:15px;color:#4b5563;"> Turn raw stats and photos into eye-catching graphics and reels.</span>
              </td>
            </tr>
            <tr>
              <td style="background-color:#f7f9fc;border:1px solid #d8e0ea;border-radius:8px;padding:12px 16px;">
                <strong style="font-size:16px;color:#111827;">🧠 Opponent Gameplan & Matchup Breakdown:</strong>
                <span style="font-size:15px;color:#4b5563;"> Detailed scout reports and tactical matchup analysis.</span>
              </td>
            </tr>
            <tr>
              <td style="background-color:#f7f9fc;border:1px solid #d8e0ea;border-radius:8px;padding:12px 16px;">
                <strong style="font-size:16px;color:#111827;">📩 College Matching & Direct Recruiter Outreach:</strong>
                <span style="font-size:15px;color:#4b5563;"> Match with target programs and draft tailored emails to college coaches.</span>
              </td>
            </tr>
            <tr>
              <td style="background-color:#f7f9fc;border:1px solid #d8e0ea;border-radius:8px;padding:12px 16px;">
                <strong style="font-size:16px;color:#111827;">📊 Athletic Resume & Stat Verification:</strong>
                <span style="font-size:15px;color:#4b5563;"> Keep your stats, physical metrics, GPA, and profile verified.</span>
              </td>
            </tr>
          </table>
        `,
        `
          <h2 style="margin:16px 0 12px 0;font-size:26px;line-height:1.2;color:#111827;font-weight:800;">🚀 Recommended Next Steps</h2>
          <ol style="margin:0 0 16px 22px;padding:0;color:#1f2937;">
            <li style="margin:0 0 12px 0;font-size:17px;line-height:1.55;">
              <strong>Upload Updates to Your Profile:</strong> Go to your profile, click the <strong>"Add Updates"</strong> button, and upload any stat sheet, video link, or transcript. Agent X will pull and structure everything automatically.
            </li>
            <li style="margin:0 0 12px 0;font-size:17px;line-height:1.55;">
              <strong>Add Your Goals to Agent X:</strong> Enter your target colleges, GPA goals, and physical targets so Agent X optimizes all recommendations around your targets.
            </li>
            <li style="margin:0 0 12px 0;font-size:17px;line-height:1.55;">
              <strong>Connect Your Accounts:</strong> Link your video platforms, social media, and email accounts so your latest film and stats pull in seamlessly.
            </li>
            <li style="margin:0;font-size:17px;line-height:1.55;">
              <strong>Use "The Lab" on Desktop:</strong> To work deeply with your game film, playbooks, and opponent gameplans, launch <strong>"The Lab"</strong> feature on desktop in Agent X.
            </li>
          </ol>
        `,
      ],
      ctaButtons: [
        { label: 'Launch Agent X', href: agentXUrl },
        { label: 'Complete Profile', href: profileUrl, variant: 'secondary' },
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
  const safeFirstName = escapeHtml(args.firstName);
  const safeSport = args.primarySport ? escapeHtml(args.primarySport) : 'your sport';
  const safeOrganization = args.organizationName
    ? escapeHtml(args.organizationName)
    : 'your program';

  return {
    subject: `Welcome to NXT1: Launch ${safeOrganization}'s Command Center`,
    campaignKey: TEAM_CAMPAIGN_KEY,
    html: buildMarketingEmailShell({
      preheader: `Welcome to NXT1! ${safeOrganization} now has a dedicated AI digital staff for film, playbooks, scouting, and team ops.`,
      eyebrow: 'Welcome to NXT1',
      title: 'Launch Your Program Command Center',
      subtitle: `Your AI digital staff is live for ${safeOrganization}.`,
      introHtml: `
        <p style="margin:0 0 16px 0;font-size:20px;line-height:1.5;color:#101722;">Coach ${safeFirstName},</p>
        <p style="margin:0 0 20px 0;font-size:18px;line-height:1.65;color:#1f2937;">
          Welcome to NXT1! We built this platform to serve as a complete AI digital staff for programs like ${safeOrganization}. From film breakdown and playbook analysis to recruiting management, parent communication, and game day scouting across ${safeSport}, NXT1 takes repetitive tasks off your coaches' plates so you can focus on winning.
        </p>
      `,
      sectionsHtml: [
        `
          <div style="background-color:#0b0f13;border:1px solid #1f2b38;border-radius:12px;padding:20px;margin-bottom:16px;color:#ffffff;">
            <p style="margin:0 0 8px 0;font-size:13px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:#ccff00;">🔬 Featured Desktop Capability</p>
            <h3 style="margin:0 0 10px 0;font-size:22px;line-height:1.3;color:#ffffff;font-weight:800;">Work With Your Film & Playbook in "The Lab"</h3>
            <p style="margin:0 0 12px 0;font-size:16px;line-height:1.6;color:#d7e0ea;">
              Launch <strong>"The Lab"</strong> on desktop to upload your playbook PDFs, game film, opponent scout cards, roster files, or strategy documents. Agent X reads and analyzes your raw documents to generate scout reports, practice scripts, and scout cards directly from your program data.
            </p>
          </div>
        `,
        `
          <h2 style="margin:0 0 12px 0;font-size:26px;line-height:1.2;color:#111827;font-weight:800;">4 Ways Your Staff Uses NXT1</h2>
          <ul style="margin:0 0 12px 22px;padding:0;color:#1f2937;">
            <li style="margin:0 0 10px 0;font-size:17px;line-height:1.55;"><strong>Autonomous Film & Opponent Scouting:</strong> Upload raw game film and breakdowns to generate instant formation tendency breakdowns, scout cards, and opponent matchup reports.</li>
            <li style="margin:0 0 10px 0;font-size:17px;line-height:1.55;"><strong>Background Execution:</strong> Agent X runs complex document processing and video breakdowns in the background and pings your staff the second deliverables are ready.</li>
            <li style="margin:0 0 10px 0;font-size:17px;line-height:1.55;"><strong>AI Coordinator Quick Actions:</strong> Access 1-click coordinator prompts for practice scripts, workout schedules, team announcements, and player evaluations.</li>
            <li style="margin:0;font-size:17px;line-height:1.55;"><strong>Automated Recurring Operations:</strong> Put weekly parent communications, player progress reports, and media graphic updates on automated recurring schedules.</li>
          </ul>
        `,
        `
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;margin-top:12px;">
            <tr>
              <td style="background-color:#f0f7ff;border:1px solid #bae0ff;border-left:4px solid #1890ff;border-radius:8px;padding:16px;">
                <p style="margin:0 0 6px 0;font-size:16px;font-weight:700;color:#003a8c;">Need 1-on-1 Help Setting Up Your Staff?</p>
                <p style="margin:0;font-size:15px;line-height:1.5;color:#002366;">Our team is ready to walk you through roster onboarding, playbook imports, and custom coordinator setups.</p>
              </td>
            </tr>
          </table>
        `,
      ],
      ctaButtons: [
        { label: 'Launch Program Workspace', href: agentXUrl },
        {
          label: 'Schedule Meeting With Us',
          href: 'https://calendar.app.google/LdFFYqWnFKKqVFn3A',
        },
      ],
      footerHtml: `
        <p style="margin:0;font-size:13px;line-height:1.5;color:#b7c5d5;">© 2026 NXT1 Sports. All rights reserved.</p>
        <p style="margin:8px 0 0 0;font-size:12px;line-height:1.5;color:#8ea0b4;">You are receiving this welcome email because you created a new NXT1 program account.</p>
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
