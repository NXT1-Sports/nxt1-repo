/**
 * @fileoverview Smart Signup Drip Campaign Email Service
 * @module @nxt1/backend/services/marketing/email/campaigns/signup/signup-drip-email
 */

import { isTeamRole } from '@nxt1/core';
import type { UserRole } from '@nxt1/core';
import type { RuntimeEnvironment } from '../../../../../config/runtime-environment.js';
import { toAbsoluteAppUrl } from '../../../../../utils/app-url.js';
import { logger } from '../../../../../utils/logger.js';
import { sendOutboundMarketingEmail } from '../../outbound-email.service.js';
import { buildMarketingEmailShell } from '../../templates/marketing-email-shell.js';

export type SignupDripEmailStepKey =
  | 'profile_setup'
  | 'agent_activation'
  | 'reengagement'
  | 'day3_inactivity_nudge'
  | 'day7_mid_trial_showcase'
  | 'day14_pretrial_feedback_no_usage'
  | 'day14_pretrial_feedback_has_usage'
  | 'day14_post_purchase_checkin'
  | 'day30_post_purchase_survey';

type SignupDripPaymentState = 'unknown' | 'unpaid' | 'paid' | 'org-covered';

const DEFAULT_FIRST_NAME = 'NXT1 Member';
const SURVEY_FORM_URL =
  'https://docs.google.com/forms/d/e/1FAIpQLSevQnSdtKY337MDhdSfUIluUVAm-T_MhptMuKLafafqSQLcxQ/viewform?usp=header';

interface SignupDripEmailInput {
  readonly userId: string;
  readonly email?: string | null;
  readonly firstName?: string | null;
  readonly environment: RuntimeEnvironment;
  readonly role: UserRole;
  readonly stepKey: SignupDripEmailStepKey;
  readonly paymentState: SignupDripPaymentState;
  readonly primarySport?: string | null;
  readonly organizationName?: string | null;
  readonly marketingEnabled?: boolean;
  readonly setupFocusAreas?: readonly string[];
}

export type SignupDripEmailResult =
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

function buildChecklistHtml(items: readonly string[]): string {
  if (items.length === 0) {
    return '';
  }

  return `
    <ul style="margin:0 0 8px 22px;padding:0;color:#1f2937;">
      ${items
        .map(
          (item) =>
            `<li style="margin:0 0 10px 0;font-size:18px;line-height:1.55;">${escapeHtml(item)}</li>`
        )
        .join('')}
    </ul>
  `;
}

function resolveSetupChecklist(
  input: SignupDripEmailInput,
  isTeamTrack: boolean
): readonly string[] {
  if (input.setupFocusAreas && input.setupFocusAreas.length > 0) {
    return input.setupFocusAreas.map((item) =>
      item
        .replaceAll('profile/program image', 'profile image')
        .replaceAll('profile/program', 'profile')
    );
  }

  return isTeamTrack
    ? [
        'Manage Team is where you upload and add details for your program like images, logo, team details, and program context.',
        'Use the connectors to connect all your platforms so your agent can work with your data seamlessly.',
        'Invite your program onboard using the "Invite Team" option so coaches, staff, and athletes can join your organization.',
        'Launch "The Lab" on desktop to upload playbook PDFs, scout cards, and game film for instant AI breakdowns.',
      ]
    : [
        'Upload a profile image so your account presents cleanly right away.',
        'Click "Add Updates" on your profile and upload any raw stat sheet, game film link, photo, or transcript — Agent X reads and structures everything automatically.',
        'Set your sport positions, GPA, physical metrics, and target goals so Agent X recommendations stay 100% relevant.',
      ];
}

function buildProfileSetupVariant(input: SignupDripEmailInput): {
  readonly subject: string;
  readonly html: string;
  readonly campaignKey: string;
} {
  const isTeamTrack = isTeamRole(input.role);
  const safeFirstName = escapeHtml(input.firstName?.trim() || DEFAULT_FIRST_NAME);
  const safeSport = escapeHtml(input.primarySport?.trim() || 'your sport');
  const safeOrganization = escapeHtml(input.organizationName?.trim() || 'your program');
  const agentXUrl = toAbsoluteAppUrl('/agent-x', { environment: input.environment });
  const checklistHtml = buildChecklistHtml(resolveSetupChecklist(input, isTeamTrack));

  return {
    subject: isTeamTrack
      ? 'Complete your NXT1 program setup so it can work harder'
      : 'Complete your NXT1 profile so NXT1 can work harder',
    campaignKey: isTeamTrack
      ? 'signup_drip_profile_setup_team'
      : 'signup_drip_profile_setup_athlete',
    html: buildMarketingEmailShell({
      preheader: 'The fastest path to value is giving NXT1 better context to work from.',
      eyebrow: 'NXT1 Setup',
      title: 'Complete the Context',
      subtitle: isTeamTrack
        ? 'A stronger program setup gives NXT1 better raw material for staff workflows, recruiting, and operations.'
        : 'A stronger athlete profile gives NXT1 better raw material for planning, visibility, and execution.',
      introHtml: isTeamTrack
        ? `
            <p style="margin:0 0 16px 0;font-size:20px;line-height:1.5;color:#101722;">Hi ${safeFirstName},</p>
            <p style="margin:0 0 20px 0;font-size:18px;line-height:1.65;color:#1f2937;">
              Your NXT1 account is live. The next move is making sure ${safeOrganization} has the right operating context so NXT1 can actually help your staff move faster across ${safeSport}.
            </p>
          `
        : `
            <p style="margin:0 0 16px 0;font-size:20px;line-height:1.5;color:#101722;">Hi ${safeFirstName},</p>
            <p style="margin:0 0 20px 0;font-size:18px;line-height:1.65;color:#1f2937;">
              Your NXT1 account is live. The next move is giving your athlete profile enough substance so NXT1 can sharpen your planning, presentation, and day-to-day execution across ${safeSport}.
            </p>
          `,
      sectionsHtml: isTeamTrack
        ? [
            `
              <h2 style="margin:0 0 10px 0;font-size:30px;line-height:1.2;color:#111827;font-weight:800;">Recommended Next Moves</h2>
              ${checklistHtml}
            `,
            `
              <h2 style="margin:0 0 10px 0;font-size:30px;line-height:1.2;color:#111827;font-weight:800;">Why This Matters</h2>
              <p style="margin:0;font-size:18px;line-height:1.65;color:#1f2937;">
                The better your setup is, the less generic NXT1 feels. Better context leads to better recommendations, clearer workflows, and stronger output every time you open it.
              </p>
            `,
          ]
        : [
            `
              <h2 style="margin:0 0 10px 0;font-size:30px;line-height:1.2;color:#111827;font-weight:800;">Recommended Next Moves</h2>
              ${checklistHtml}
            `,
            `
              <h2 style="margin:20px 0 12px 0;font-size:26px;line-height:1.2;color:#111827;font-weight:800;">⚡ What Agent X Has Already Done for Athletes</h2>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:separate;border-spacing:0 10px;">
                <tr>
                  <td style="background-color:#f7f9fc;border:1px solid #d8e0ea;border-left:4px solid #ccff00;border-radius:8px;padding:14px 16px;">
                    <p style="margin:0 0 4px 0;font-size:16px;font-weight:700;color:#111827;">💬 "Contacted 100 colleges while I was working out."</p>
                    <p style="margin:0;font-size:15px;line-height:1.55;color:#4b5563;">Agent X pulled target programs matching my GPA & stats, drafted tailored recruiter emails, and delivered them automatically while I was at practice.</p>
                  </td>
                </tr>
                <tr>
                  <td style="background-color:#f7f9fc;border:1px solid #d8e0ea;border-left:4px solid #ccff00;border-radius:8px;padding:14px 16px;">
                    <p style="margin:0 0 4px 0;font-size:16px;font-weight:700;color:#111827;">🎬 "Extracted 10 highlight clips & graphics after Friday's game."</p>
                    <p style="margin:0;font-size:15px;line-height:1.55;color:#4b5563;">Uploaded my raw game film at midnight, woke up to a structured highlight breakdown and 3 game day graphics ready to share.</p>
                  </td>
                </tr>
                <tr>
                  <td style="background-color:#f7f9fc;border:1px solid #d8e0ea;border-left:4px solid #ccff00;border-radius:8px;padding:14px 16px;">
                    <p style="margin:0 0 4px 0;font-size:16px;font-weight:700;color:#111827;">📊 "Turned a raw PDF stat sheet into a verified athletic resume."</p>
                    <p style="margin:0;font-size:15px;line-height:1.55;color:#4b5563;">Clicked 'Add Updates' on my profile, dropped the PDF in, and Agent X updated my career metrics automatically.</p>
                  </td>
                </tr>
              </table>
            `,
            `
              <h2 style="margin:16px 0 10px 0;font-size:26px;line-height:1.2;color:#111827;font-weight:800;">Why This Matters</h2>
              <p style="margin:0;font-size:18px;line-height:1.65;color:#1f2937;">
                The better your profile context is, the sharper Agent X becomes. Better context leads to better recommendations, clearer workflows, and stronger output every time you use it.
              </p>
            `,
          ],
      ctaButtons: [{ label: 'Open Agent X', href: agentXUrl }],
      footerHtml: `
        <p style="margin:0;font-size:13px;line-height:1.5;color:#b7c5d5;">© 2026 NXT1 Sports. All rights reserved.</p>
        <p style="margin:8px 0 0 0;font-size:12px;line-height:1.5;color:#8ea0b4;">You are receiving this email because you recently created a NXT1 account.</p>
      `,
    }),
  };
}

function buildAgentActivationVariant(input: SignupDripEmailInput): {
  readonly subject: string;
  readonly html: string;
  readonly campaignKey: string;
} {
  const isTeamTrack = isTeamRole(input.role);
  const safeFirstName = escapeHtml(input.firstName?.trim() || DEFAULT_FIRST_NAME);
  const safeOrganization = escapeHtml(input.organizationName?.trim() || 'your program');
  const agentXUrl = toAbsoluteAppUrl('/agent-x', { environment: input.environment });

  return {
    subject: isTeamTrack
      ? `Put Agent X on Real Program Work for ${safeOrganization}`
      : 'Put Agent X on Real Work for You',
    campaignKey: isTeamTrack
      ? 'signup_drip_agent_activation_team'
      : 'signup_drip_agent_activation_athlete',
    html: buildMarketingEmailShell({
      preheader: isTeamTrack
        ? 'NXT1 is an active AI digital staff built to handle real coaching and team operations.'
        : 'NXT1 is not a passive app you browse: it is an active AI system built to work for you 24/7.',
      eyebrow: 'Active Execution',
      title: isTeamTrack ? 'Put Agent X on Real Program Work' : 'Put Agent X to Work for You',
      subtitle: isTeamTrack
        ? `Let Agent X handle repetitive administrative, film, and scouting tasks for ${safeOrganization}.`
        : 'NXT1 is not a passive app you browse: it is an active system built to work for you.',
      introHtml: isTeamTrack
        ? `
            <p style="margin:0 0 16px 0;font-size:20px;line-height:1.5;color:#101722;">Coach ${safeFirstName},</p>
            <p style="margin:0 0 20px 0;font-size:18px;line-height:1.65;color:#1f2937;">
              Coaching isn't just what happens on the field: it's the endless hours spent on scout reports, practice scripts, parent updates, and film breakdown. Agent X is built to serve as your AI digital staff, taking repetitive administrative work completely off your coaches' plates.
            </p>
          `
        : `
            <p style="margin:0 0 16px 0;font-size:20px;line-height:1.5;color:#101722;">Hi ${safeFirstName},</p>
            <p style="margin:0 0 20px 0;font-size:18px;line-height:1.65;color:#1f2937;">
              NXT1 is built differently. It's not a passive app you occasionally open to scroll: it's an active AI system working for you 24/7. When you give Agent X a task, it takes it off your plate and delivers real results so you can focus on executing on the field.
            </p>
          `,
      sectionsHtml: [
        isTeamTrack
          ? `
              <h2 style="margin:0 0 12px 0;font-size:26px;line-height:1.2;color:#111827;font-weight:800;">Real Program Prompts to Run Right Now</h2>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:separate;border-spacing:0 10px;">
                <tr>
                  <td style="background-color:#f7f9fc;border:1px solid #d8e0ea;border-radius:8px;padding:14px 16px;">
                    <strong style="font-size:16px;color:#111827;">🏈 Opponent Film Tendency Breakdown:</strong>
                    <p style="margin:4px 0 0 0;font-size:15px;color:#1f2937;">“Analyze our opponent’s film from last week and extract their 3 most frequent offensive formations and play tendencies.”</p>
                  </td>
                </tr>
                <tr>
                  <td style="background-color:#f7f9fc;border:1px solid #d8e0ea;border-radius:8px;padding:14px 16px;">
                    <strong style="font-size:16px;color:#111827;">📋 Practice Script & Scout Cards:</strong>
                    <p style="margin:4px 0 0 0;font-size:15px;color:#1f2937;">“Generate a 1-page scout card and practice script based on our game plan in The Lab.”</p>
                  </td>
                </tr>
                <tr>
                  <td style="background-color:#f7f9fc;border:1px solid #d8e0ea;border-radius:8px;padding:14px 16px;">
                    <strong style="font-size:16px;color:#111827;">📩 Weekly Parent & Player Update:</strong>
                    <p style="margin:4px 0 0 0;font-size:15px;color:#1f2937;">“Draft a weekly program update email for players and parents summarizing this week’s practice and travel schedule.”</p>
                  </td>
                </tr>
              </table>
            `
          : `
              <h2 style="margin:0 0 12px 0;font-size:26px;line-height:1.2;color:#111827;font-weight:800;">Real Prompts to Try Right Now</h2>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:separate;border-spacing:0 10px;">
                <tr>
                  <td style="background-color:#f7f9fc;border:1px solid #d8e0ea;border-radius:8px;padding:14px 16px;">
                    <strong style="font-size:16px;color:#111827;">🎬 Instant Film Analysis:</strong>
                    <p style="margin:4px 0 0 0;font-size:15px;color:#1f2937;">“Analyze my game film from Friday and extract my top 5 highlight moments with style notes.”</p>
                  </td>
                </tr>
                <tr>
                  <td style="background-color:#f7f9fc;border:1px solid #d8e0ea;border-radius:8px;padding:14px 16px;">
                    <strong style="font-size:16px;color:#111827;">📩 College Recruiter Follow-Up:</strong>
                    <p style="margin:4px 0 0 0;font-size:15px;color:#1f2937;">“Draft a personalized follow-up message to Coach Smith at Ohio State highlighting my GPA and recent stats.”</p>
                  </td>
                </tr>
                <tr>
                  <td style="background-color:#f7f9fc;border:1px solid #d8e0ea;border-radius:8px;padding:14px 16px;">
                    <strong style="font-size:16px;color:#111827;">🎨 Game Day Graphic Creation:</strong>
                    <p style="margin:4px 0 0 0;font-size:15px;color:#1f2937;">“Create a custom game day graphic with my jersey number, stats, and team matchup.”</p>
                  </td>
                </tr>
              </table>
            `,
        `
          <div style="background-color:#edf8cf;border:1px solid #cfe89b;border-left:4px solid #91c11f;border-radius:8px;padding:16px;margin-top:8px;">
            <p style="margin:0 0 6px 0;font-size:16px;font-weight:700;color:#25320d;">⚡ Put Tasks on Recurring Schedule</p>
            <p style="margin:0;font-size:15px;line-height:1.55;color:#25320d;">Did you know you can put tasks on a recurring schedule in Agent X? Set weekly film breakdowns, recruiting follow-ups, or social graphic updates to run automatically every single week.</p>
          </div>
        `,
      ],
      ctaButtons: isTeamTrack
        ? [
            { label: 'Open Program Workspace', href: agentXUrl },
            {
              label: 'Schedule Meeting With Us',
              href: 'https://calendar.app.google/LdFFYqWnFKKqVFn3A',
            },
          ]
        : [{ label: 'Launch Agent X', href: agentXUrl }],
      footerHtml: `
        <p style="margin:0;font-size:13px;line-height:1.5;color:#b7c5d5;">© 2026 NXT1 Sports. All rights reserved.</p>
        <p style="margin:8px 0 0 0;font-size:12px;line-height:1.5;color:#8ea0b4;">You are receiving this email because you recently created a NXT1 account.</p>
      `,
    }),
  };
}

function buildReengagementVariant(input: SignupDripEmailInput): {
  readonly subject: string;
  readonly html: string;
  readonly campaignKey: string;
} {
  const isTeamTrack = isTeamRole(input.role);
  const safeFirstName = escapeHtml(input.firstName?.trim() || DEFAULT_FIRST_NAME);
  const safeOrganization = escapeHtml(input.organizationName?.trim() || 'your program');
  const agentXUrl = toAbsoluteAppUrl('/agent-x', { environment: input.environment });
  const paidState = input.paymentState === 'paid' || input.paymentState === 'org-covered';

  return {
    subject: isTeamTrack
      ? `Coach ${safeFirstName}, Build a Complete AI Digital Staff for ${safeOrganization}`
      : `Why You Need Your Team of AI Coordinators Active, ${safeFirstName}`,
    campaignKey: paidState
      ? isTeamTrack
        ? 'signup_drip_reengagement_paid_team'
        : 'signup_drip_reengagement_paid_athlete'
      : isTeamTrack
        ? 'signup_drip_reengagement_unpaid_team'
        : 'signup_drip_reengagement_unpaid_athlete',
    html: buildMarketingEmailShell({
      preheader: isTeamTrack
        ? 'See how leading sports programs use Agent X to automate film, scouting, and team ops.'
        : 'See why top athletes use Agent X as their 24/7 team of AI coordinators.',
      eyebrow: 'NXT1 Power Overview',
      title: isTeamTrack ? 'Your Program AI Digital Staff' : 'Your 24/7 Team of AI Coordinators',
      subtitle: isTeamTrack
        ? `Built to streamline film, scouting, recruiting, and operations for ${safeOrganization}.`
        : 'Organize your film, graphics, media, and training in one place.',
      introHtml: isTeamTrack
        ? `
            <p style="margin:0 0 16px 0;font-size:20px;line-height:1.5;color:#101722;">Coach ${safeFirstName},</p>
            <p style="margin:0 0 20px 0;font-size:18px;line-height:1.65;color:#1f2937;">
              In modern sports, the administrative burden on coaching staffs has never been higher. NXT1 was engineered specifically to take that work off your shoulders so you can focus on strategy, player development, and game day execution.
            </p>
          `
        : `
            <p style="margin:0 0 16px 0;font-size:20px;line-height:1.5;color:#101722;">Hi ${safeFirstName},</p>
            <p style="margin:0 0 20px 0;font-size:18px;line-height:1.65;color:#1f2937;">
              The athletes who perform and stay ahead aren't just working hard on the field or court — they have systems in place for film, media, content, and weekly execution. Agent X acts as your 24/7 team of AI coordinators so you never miss a beat.
            </p>
          `,
      sectionsHtml: isTeamTrack
        ? [
            `
              <h2 style="margin:0 0 12px 0;font-size:26px;line-height:1.2;color:#111827;font-weight:800;">4 Pillars of Agent X Power</h2>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:separate;border-spacing:0 8px;">
                <tr>
                  <td style="background-color:#f7f9fc;border:1px solid #d8e0ea;border-radius:8px;padding:14px 16px;">
                    <strong style="font-size:16px;color:#111827;">🎬 Film & Playbook Analysis in "The Lab":</strong>
                    <p style="margin:4px 0 0 0;font-size:15px;color:#4b5563;">Upload raw game film, video breakdowns, or playbook PDFs for instant breakdowns and tendency extraction.</p>
                  </td>
                </tr>
                <tr>
                  <td style="background-color:#f7f9fc;border:1px solid #d8e0ea;border-radius:8px;padding:14px 16px;">
                    <strong style="font-size:16px;color:#111827;">🎨 AI Graphic & Media Studio:</strong>
                    <p style="margin:4px 0 0 0;font-size:15px;color:#4b5563;">Create pro-tier game day graphics, stat cards, and highlight overlays in seconds.</p>
                  </td>
                </tr>
                <tr>
                  <td style="background-color:#f7f9fc;border:1px solid #d8e0ea;border-radius:8px;padding:14px 16px;">
                    <strong style="font-size:16px;color:#111827;">📩 Automated Outreach & Communication:</strong>
                    <p style="margin:4px 0 0 0;font-size:15px;color:#4b5563;">Draft personalized emails to college coaches, recruiters, or parent listservs instantly.</p>
                  </td>
                </tr>
                <tr>
                  <td style="background-color:#f7f9fc;border:1px solid #d8e0ea;border-radius:8px;padding:14px 16px;">
                    <strong style="font-size:16px;color:#111827;">🧠 Opponent Scouting & Gameplan Engine:</strong>
                    <p style="margin:4px 0 0 0;font-size:15px;color:#4b5563;">Generate 1-page scout reports, key matchup advantages, and practice scripts.</p>
                  </td>
                </tr>
              </table>
            `,
          ]
        : [
            `
              <h2 style="margin:0 0 12px 0;font-size:26px;line-height:1.2;color:#111827;font-weight:800;">4 Pillars of Agent X Power</h2>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:separate;border-spacing:0 8px;">
                <tr>
                  <td style="background-color:#f7f9fc;border:1px solid #d8e0ea;border-radius:8px;padding:14px 16px;">
                    <strong style="font-size:16px;color:#111827;">🎬 Film & Playbook Breakdown in "The Lab":</strong>
                    <p style="margin:4px 0 0 0;font-size:15px;color:#4b5563;">Upload raw game film, video breakdowns, or playbook PDFs for instant breakdowns and tendency extraction.</p>
                  </td>
                </tr>
                <tr>
                  <td style="background-color:#f7f9fc;border:1px solid #d8e0ea;border-radius:8px;padding:14px 16px;">
                    <strong style="font-size:16px;color:#111827;">🎨 AI Graphic & Media Studio:</strong>
                    <p style="margin:4px 0 0 0;font-size:15px;color:#4b5563;">Create pro-tier game day graphics, stat cards, and highlight overlays in seconds.</p>
                  </td>
                </tr>
                <tr>
                  <td style="background-color:#f7f9fc;border:1px solid #d8e0ea;border-radius:8px;padding:14px 16px;">
                    <strong style="font-size:16px;color:#111827;">📩 Automated Media & Brand Communications:</strong>
                    <p style="margin:4px 0 0 0;font-size:15px;color:#4b5563;">Draft personalized messages to sponsors, media outlets, trainers, and program directors instantly.</p>
                  </td>
                </tr>
                <tr>
                  <td style="background-color:#f7f9fc;border:1px solid #d8e0ea;border-radius:8px;padding:14px 16px;">
                    <strong style="font-size:16px;color:#111827;">🧠 Opponent Scouting & Training Schedules:</strong>
                    <p style="margin:4px 0 0 0;font-size:15px;color:#4b5563;">Generate 1-page scout reports, key matchup advantages, and structured workout schedules.</p>
                  </td>
                </tr>
              </table>
            `,
            `
              <h2 style="margin:20px 0 12px 0;font-size:26px;line-height:1.2;color:#111827;font-weight:800;">⚡ Proven Results From Real Athletes</h2>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:separate;border-spacing:0 10px;">
                <tr>
                  <td style="background-color:#f7f9fc;border:1px solid #d8e0ea;border-left:4px solid #ccff00;border-radius:8px;padding:14px 16px;">
                    <p style="margin:0 0 4px 0;font-size:16px;font-weight:700;color:#111827;">🏈 Torrey Paul (Football):</p>
                    <p style="margin:0;font-size:15px;line-height:1.55;color:#1f2937;">“Agent X broke down my full game film, extracted my 8 best highlight clips, and generated 4 custom game day graphics in under 3 minutes after Friday's game.”</p>
                  </td>
                </tr>
                <tr>
                  <td style="background-color:#f7f9fc;border:1px solid #d8e0ea;border-left:4px solid #ccff00;border-radius:8px;padding:14px 16px;">
                    <p style="margin:0 0 4px 0;font-size:16px;font-weight:700;color:#111827;">🏀 Marcus Vance (Basketball):</p>
                    <p style="margin:0;font-size:15px;line-height:1.55;color:#1f2937;">“I used 'The Lab' on desktop to analyze our opponent's defensive tendencies and generate a 1-page matchup breakdown before our playoff game.”</p>
                  </td>
                </tr>
                <tr>
                  <td style="background-color:#f7f9fc;border:1px solid #d8e0ea;border-left:4px solid #ccff00;border-radius:8px;padding:14px 16px;">
                    <p style="margin:0 0 4px 0;font-size:16px;font-weight:700;color:#111827;">🏐 Aaliyah Jackson (Volleyball):</p>
                    <p style="margin:0;font-size:15px;line-height:1.55;color:#1f2937;">“Agent X built my entire weekly training, recovery, and media posting schedule automatically while I was in class.”</p>
                  </td>
                </tr>
              </table>
            `,
            `
              <p style="margin:20px 0 0 0;font-size:18px;line-height:1.65;color:#1f2937;">
                Ready to put your team of AI coordinators to work? Launch Agent X today and start executing your next deliverables in minutes.
              </p>
            `,
          ],
      ctaButtons: isTeamTrack
        ? [
            { label: 'Open Program Workspace', href: agentXUrl },
            {
              label: 'Schedule Meeting With Us',
              href: 'https://calendar.app.google/LdFFYqWnFKKqVFn3A',
            },
          ]
        : [{ label: 'Put Agent X to Work', href: agentXUrl }],
      footerHtml: `
        <p style="margin:0;font-size:13px;line-height:1.5;color:#b7c5d5;">© 2026 NXT1 Sports. All rights reserved.</p>
        <p style="margin:8px 0 0 0;font-size:12px;line-height:1.5;color:#8ea0b4;">You are receiving this overview as a registered NXT1 user.</p>
      `,
    }),
  };
}

function buildDay3InactivityVariant(input: SignupDripEmailInput): {
  readonly subject: string;
  readonly html: string;
  readonly campaignKey: string;
} {
  const isTeamTrack = isTeamRole(input.role);
  const safeFirstName = escapeHtml(input.firstName?.trim() || DEFAULT_FIRST_NAME);
  const agentXUrl = toAbsoluteAppUrl('/agent-x', { environment: input.environment });

  return {
    subject: isTeamTrack
      ? 'Coach, Save 2 Hours Today with Agent X ⏱️'
      : '5 Starter Prompts to Put Agent X to Work 🎬',
    campaignKey: isTeamTrack
      ? 'signup_drip_day3_inactivity_team'
      : 'signup_drip_day3_inactivity_athlete',
    html: buildMarketingEmailShell({
      preheader: isTeamTrack
        ? 'Save hours on coaching ops, scout reports, and roster management with Agent X.'
        : 'Get instant film breakdowns, highlight graphics, and college outreach templates in under 2 minutes.',
      eyebrow: '1-Click Quick Start',
      title: isTeamTrack
        ? 'Save 2 Hours on Coaching Ops Today'
        : '5 Starter Prompts to Try Right Now',
      subtitle: isTeamTrack
        ? 'High-value coaching workflows ready to execute with 1 click in Agent X.'
        : 'Copy and paste any of these 5 prompts to see instant results.',
      introHtml: isTeamTrack
        ? `
            <p style="margin:0 0 16px 0;font-size:20px;line-height:1.5;color:#101722;">Coach ${safeFirstName},</p>
            <p style="margin:0 0 20px 0;font-size:18px;line-height:1.65;color:#1f2937;">
              NXT1 is designed to give you and your staff hours back every single week. Whether it's game day prep, opponent scouting, or roster management, Agent X is ready to do the heavy lifting for your program.
            </p>
          `
        : `
            <p style="margin:0 0 16px 0;font-size:20px;line-height:1.5;color:#101722;">Hi ${safeFirstName},</p>
            <p style="margin:0 0 20px 0;font-size:18px;line-height:1.65;color:#1f2937;">
              We noticed you haven't executed your first Agent X workflow yet. NXT1 is built to take work off your plate immediately. Here are 5 starter prompts you can copy and paste into Agent X right now:
            </p>
          `,
      sectionsHtml: [
        isTeamTrack
          ? `
              <h2 style="margin:0 0 12px 0;font-size:26px;line-height:1.2;color:#111827;font-weight:800;">5 High-Value Program Prompts</h2>
              <ol style="margin:0 0 12px 22px;padding:0;color:#1f2937;">
                <li style="margin:0 0 10px 0;font-size:17px;line-height:1.55;"><strong>"Generate an opponent scout breakdown from our game film"</strong>: Extract play tendencies and key player threats.</li>
                <li style="margin:0 0 10px 0;font-size:17px;line-height:1.55;"><strong>"Create a weekly practice script and period plan"</strong>: Turn your game plan into usable staff materials.</li>
                <li style="margin:0 0 10px 0;font-size:17px;line-height:1.55;"><strong>"Draft a weekly program update for parents and players"</strong>: Keep your program aligned with clean communications.</li>
                <li style="margin:0 0 10px 0;font-size:17px;line-height:1.55;"><strong>"Create a game day matchup graphic for social media"</strong>: Generate branded media assets for your program.</li>
                <li style="margin:0;font-size:17px;line-height:1.55;"><strong>"Organize our player roster by position and graduation year"</strong>: Maintain a structured team database.</li>
              </ol>

              <h2 style="margin:16px 0 12px 0;font-size:26px;line-height:1.2;color:#111827;font-weight:800;">⚡ What Agent X Handles for Coaching Staffs</h2>
              <ul style="margin:0 0 8px 22px;padding:0;color:#1f2937;">
                <li style="margin:0 0 8px 0;font-size:16px;line-height:1.5;">🎬 Film Breakdown & Tendency Extraction</li>
                <li style="margin:0 0 8px 0;font-size:16px;line-height:1.5;">🧠 Opponent Scouting & Gameplan Generation</li>
                <li style="margin:0 0 8px 0;font-size:16px;line-height:1.5;">📋 Practice Script & Period Plan Creation</li>
                <li style="margin:0 0 8px 0;font-size:16px;line-height:1.5;">🎨 Branded Game Day Graphic & Media Studio</li>
                <li style="margin:0;font-size:16px;line-height:1.5;">📩 Parent & Player Communication Engine</li>
              </ul>
            `
          : `
              <h2 style="margin:0 0 12px 0;font-size:26px;line-height:1.2;color:#111827;font-weight:800;">5 Prompts to Try Right Now</h2>
              <ol style="margin:0 0 12px 22px;padding:0;color:#1f2937;">
                <li style="margin:0 0 10px 0;font-size:17px;line-height:1.55;"><strong>"Analyze my film on how I can improve"</strong>: Get an instant breakdown of your technique and key areas for development.</li>
                <li style="margin:0 0 10px 0;font-size:17px;line-height:1.55;"><strong>"How should we attack our next opponent"</strong>: Generate a tactical matchup breakdown and key advantages.</li>
                <li style="margin:0 0 10px 0;font-size:17px;line-height:1.55;"><strong>"Create me a highlight reel with style"</strong>: Turn your game clips into a polished, styled highlight presentation.</li>
                <li style="margin:0 0 10px 0;font-size:17px;line-height:1.55;"><strong>"Find 25 colleges that match me"</strong>: Discover target programs that fit your athletic stats, GPA, and location preferences.</li>
                <li style="margin:0;font-size:17px;line-height:1.55;"><strong>"Contact 30 college coaches right now"</strong>: Draft personalized outreach templates tailored to college recruiting staffs.</li>
              </ol>
            `,
      ],
      ctaButtons: isTeamTrack
        ? [
            { label: 'Try Team Prompts', href: agentXUrl },
            {
              label: 'Schedule Meeting With Us',
              href: 'https://calendar.app.google/LdFFYqWnFKKqVFn3A',
            },
          ]
        : [{ label: 'Try Prompts in Agent X', href: agentXUrl }],
      footerHtml: `
        <p style="margin:0;font-size:13px;line-height:1.5;color:#b7c5d5;">© 2026 NXT1 Sports. All rights reserved.</p>
        <p style="margin:8px 0 0 0;font-size:12px;line-height:1.5;color:#8ea0b4;">You are receiving this quick-start guide as a registered NXT1 member.</p>
      `,
    }),
  };
}

function buildDay7MidTrialVariant(input: SignupDripEmailInput): {
  readonly subject: string;
  readonly html: string;
  readonly campaignKey: string;
} {
  const isTeamTrack = isTeamRole(input.role);
  const safeFirstName = escapeHtml(input.firstName?.trim() || DEFAULT_FIRST_NAME);
  const safeOrganization = escapeHtml(input.organizationName?.trim() || 'your program');
  const agentXUrl = toAbsoluteAppUrl('/agent-x', { environment: input.environment });

  return {
    subject: isTeamTrack
      ? `Coach, Explore Advanced Program Workflows in The Lab ⚡`
      : 'Unlock Higher-Level Agent X Workflows ⚡',
    campaignKey: isTeamTrack
      ? 'signup_drip_day7_mid_trial_team'
      : 'signup_drip_day7_mid_trial_athlete',
    html: buildMarketingEmailShell({
      preheader: isTeamTrack
        ? 'Next-level use cases from The Lab, playbook imports, and 100s of coaching prompts.'
        : 'Explore higher-level workflows, custom media templates, and 100s of prompts via the Ask Agent button.',
      eyebrow: 'Advanced Workflows',
      title: isTeamTrack
        ? 'Elevate Your Program Operating System'
        : 'Take Your Athlete Workflow Further',
      subtitle: isTeamTrack
        ? `Multi-game trend analysis, opponent scouting, and tendency extraction for ${safeOrganization}.`
        : 'Deep film analysis, automated recruiter campaigns, and 100s of prompts in Ask Agent.',
      introHtml: isTeamTrack
        ? `
            <p style="margin:0 0 16px 0;font-size:20px;line-height:1.5;color:#101722;">Coach ${safeFirstName},</p>
            <p style="margin:0 0 20px 0;font-size:18px;line-height:1.65;color:#1f2937;">
              Your staff has started exploring Agent X: now take your program setup to the next level with advanced use cases inside <strong>"The Lab"</strong> and our pre-built coaching prompt library.
            </p>
          `
        : `
            <p style="margin:0 0 16px 0;font-size:20px;line-height:1.5;color:#101722;">Hi ${safeFirstName},</p>
            <p style="margin:0 0 20px 0;font-size:18px;line-height:1.65;color:#1f2937;">
              You've started using Agent X: now unlock higher-level workflows designed to accelerate your recruiting, film breakdown, and personal media presentation.
            </p>
          `,
      sectionsHtml: [
        isTeamTrack
          ? `
              <h2 style="margin:0 0 12px 0;font-size:26px;line-height:1.2;color:#111827;font-weight:800;">🔬 Advanced Use Cases in "The Lab"</h2>
              <ul style="margin:0 0 12px 22px;padding:0;color:#1f2937;">
                <li style="margin:0 0 10px 0;font-size:17px;line-height:1.55;"><strong>Opponent Film Breakdown & Tendencies:</strong> Upload raw game film and breakdowns into The Lab to extract offensive/defensive formation tendencies and key player threats automatically.</li>
                <li style="margin:0 0 10px 0;font-size:17px;line-height:1.55;"><strong>Multi-Game Trend Scouting:</strong> Combine stat sheets and game breakdowns across multiple weeks to spot staff insights and tactical matchup advantages.</li>
                <li style="margin:0;font-size:17px;line-height:1.55;"><strong>Playbook & Practice Script Breakdown:</strong> Upload playbook PDFs and game plan notes to generate structured practice scripts and period plans for your coaching staff.</li>
              </ul>
            `
          : `
              <h2 style="margin:0 0 12px 0;font-size:26px;line-height:1.2;color:#111827;font-weight:800;">⚡ Higher-Level Workflows Available Now</h2>
              <ul style="margin:0 0 12px 22px;padding:0;color:#1f2937;">
                <li style="margin:0 0 10px 0;font-size:17px;line-height:1.55;"><strong>Full Game Film Analysis & Scouting:</strong> Deep breakdowns with clip extraction and technique evaluation.</li>
                <li style="margin:0 0 10px 0;font-size:17px;line-height:1.55;"><strong>Automated Recruiter Outreach Sequences:</strong> Multi-touch email campaigns sent directly to college coaching staffs.</li>
                <li style="margin:0;font-size:17px;line-height:1.55;"><strong>AI Graphic & Video Studio:</strong> Professional overlays, stat cards, and commitment graphics.</li>
              </ul>
            `,
        `
          <div style="background-color:#0b0f13;border:1px solid #1f2b38;border-radius:10px;padding:16px;color:#ffffff;margin-top:8px;">
            <p style="margin:0 0 6px 0;font-size:13px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:#ccff00;">💡 Pro Tip: The "Ask Agent" Button</p>
            <p style="margin:0;font-size:15px;line-height:1.5;color:#d7e0ea;">Click the <strong>"Ask Agent"</strong> button inside Agent X to explore 100s of pre-built coordinator prompts for every sport and coaching situation!</p>
          </div>
        `,
      ],
      ctaButtons: isTeamTrack
        ? [
            { label: 'Explore 100s of Coach Prompts', href: agentXUrl },
            {
              label: 'Schedule Strategy Session',
              href: 'https://calendar.app.google/LdFFYqWnFKKqVFn3A',
            },
          ]
        : [{ label: 'Explore 100s of Prompts', href: agentXUrl }],
      footerHtml: `
        <p style="margin:0;font-size:13px;line-height:1.5;color:#b7c5d5;">© 2026 NXT1 Sports. All rights reserved.</p>
        <p style="margin:8px 0 0 0;font-size:12px;line-height:1.5;color:#8ea0b4;">You are receiving this workflow showcase as a registered NXT1 member.</p>
      `,
    }),
  };
}

function buildDay14PreTrialFeedbackNoUsageVariant(input: SignupDripEmailInput): {
  readonly subject: string;
  readonly html: string;
  readonly campaignKey: string;
} {
  const isTeamTrack = isTeamRole(input.role);
  const safeFirstName = escapeHtml(input.firstName?.trim() || DEFAULT_FIRST_NAME);
  const safeOrganization = escapeHtml(input.organizationName?.trim() || 'your program');

  return {
    subject: isTeamTrack
      ? `Coach ${safeFirstName}, Quick Question About ${safeOrganization} ❓`
      : `Quick Question About NXT1, ${safeFirstName} ❓`,
    campaignKey: 'signup_drip_day14_feedback_no_usage',
    html: buildMarketingEmailShell({
      preheader: isTeamTrack
        ? 'Tell us how we can help your coaching staff get started with NXT1.'
        : 'Take our 60-second survey and receive $5 in free credits in your wallet!',
      eyebrow: '',
      title: 'What Blocked You From Getting Started?',
      subtitle: 'We build NXT1 for real work. Tell us how we can do better.',
      introHtml: `
        <p style="margin:0 0 16px 0;font-size:20px;line-height:1.5;color:#101722;">Hi ${safeFirstName},</p>
        <p style="margin:0 0 20px 0;font-size:18px;line-height:1.65;color:#1f2937;">
          We noticed you created an account 2 weeks ago, but haven't executed your first Agent X workflow yet.
          We build NXT1 based on real user input and would love your quick feedback:
        </p>
      `,
      sectionsHtml: [
        `
          <ul style="margin:0 0 12px 22px;padding:0;color:#1f2937;">
            <li style="margin:0 0 10px 0;font-size:17px;line-height:1.55;">Was the onboarding or workspace setup confusing?</li>
            <li style="margin:0 0 10px 0;font-size:17px;line-height:1.55;">Were you missing a specific sport, document import, or integration?</li>
            <li style="margin:0;font-size:17px;line-height:1.55;">Did you run out of time or need a staff walkthrough?</li>
          </ul>
        `,
        isTeamTrack
          ? `
              <p style="margin:12px 0 0 0;font-size:17px;line-height:1.6;color:#1f2937;">
                If your staff needs a 1-on-1 walkthrough or custom playbook import, you can also schedule a quick meeting directly with our team!
              </p>
            `
          : `
              <div style="background-color:#edf8cf;border:1px solid #cfe89b;border-left:4px solid #91c11f;border-radius:8px;padding:16px;margin-top:12px;">
                <p style="margin:0 0 4px 0;font-size:16px;font-weight:700;color:#25320d;">🎁 $5 Free Credits Bonus</p>
                <p style="margin:0;font-size:15px;line-height:1.5;color:#25320d;">Complete our quick 60-second survey below and we will immediately drop <strong>$5 in free credits</strong> into your NXT1 wallet!</p>
              </div>
            `,
      ],
      ctaButtons: isTeamTrack
        ? [
            { label: 'Take Program Survey', href: SURVEY_FORM_URL },
            { label: 'Schedule 1-on-1 Call', href: 'https://nxt1sports.com/schedule' },
          ]
        : [
            {
              label: 'Take Feedback Survey ($5 Free Credits)',
              href: SURVEY_FORM_URL,
            },
          ],
      footerHtml: `
        <p style="margin:0;font-size:13px;line-height:1.5;color:#b7c5d5;">© 2026 NXT1 Sports. All rights reserved.</p>
        <p style="margin:8px 0 0 0;font-size:12px;line-height:1.5;color:#8ea0b4;">You are receiving this feedback request as a registered NXT1 user.</p>
      `,
    }),
  };
}

function buildDay14PreTrialFeedbackHasUsageVariant(input: SignupDripEmailInput): {
  readonly subject: string;
  readonly html: string;
  readonly campaignKey: string;
} {
  const isTeamTrack = isTeamRole(input.role);
  const safeFirstName = escapeHtml(input.firstName?.trim() || DEFAULT_FIRST_NAME);

  return {
    subject: `How Did Your First Agent X Tasks Go, ${safeFirstName}? 💬`,
    campaignKey: 'signup_drip_day14_feedback_has_usage',
    html: buildMarketingEmailShell({
      preheader: isTeamTrack
        ? "We'd love to know how Agent X performed on your team workflows."
        : 'Share your feedback in our 60-second survey and get $5 in free wallet credits!',
      eyebrow: '',
      title: 'How Were Your First Workflows?',
      subtitle: 'Your feedback directly drives our feature updates and coordinator prompts.',
      introHtml: `
        <p style="margin:0 0 16px 0;font-size:20px;line-height:1.5;color:#101722;">Hi ${safeFirstName},</p>
        <p style="margin:0 0 20px 0;font-size:18px;line-height:1.65;color:#1f2937;">
          You executed your first tasks on NXT1! We want to make sure Agent X delivers maximum performance across all your workflows — whether it's film breakdown, graphic studio, opponent scouting, or recruiter campaigns.
        </p>
      `,
      sectionsHtml: [
        `
          <p style="margin:0 0 12px 0;font-size:17px;line-height:1.65;color:#1f2937;">
            Did the deliverable meet your expectations? Is there a feature or sport workflow you wish Agent X could handle?
          </p>
        `,
        isTeamTrack
          ? `
              <p style="margin:12px 0 0 0;font-size:17px;line-height:1.6;color:#1f2937;">
                Take 60 seconds to complete our program feedback survey or book a call with our coaching support team.
              </p>
            `
          : `
              <div style="background-color:#edf8cf;border:1px solid #cfe89b;border-left:4px solid #91c11f;border-radius:8px;padding:16px;margin-top:12px;">
                <p style="margin:0 0 4px 0;font-size:16px;font-weight:700;color:#25320d;">🎁 Get $5 in Free Wallet Credits</p>
                <p style="margin:0;font-size:15px;line-height:1.5;color:#25320d;">Take 60 seconds to complete our feedback survey and we will instantly add <strong>$5 in free credits</strong> to your wallet!</p>
              </div>
            `,
      ],
      ctaButtons: isTeamTrack
        ? [
            { label: 'Take Program Survey', href: SURVEY_FORM_URL },
            { label: 'Schedule Call With Us', href: 'https://nxt1sports.com/schedule' },
          ]
        : [{ label: 'Take Feedback Survey ($5 Credits)', href: SURVEY_FORM_URL }],
      footerHtml: `
        <p style="margin:0;font-size:13px;line-height:1.5;color:#b7c5d5;">© 2026 NXT1 Sports. All rights reserved.</p>
        <p style="margin:8px 0 0 0;font-size:12px;line-height:1.5;color:#8ea0b4;">You are receiving this check-in as a NXT1 user.</p>
      `,
    }),
  };
}

function buildDay14PostPurchaseCheckinVariant(input: SignupDripEmailInput): {
  readonly subject: string;
  readonly html: string;
  readonly campaignKey: string;
} {
  const isTeamTrack = isTeamRole(input.role);
  const safeFirstName = escapeHtml(input.firstName?.trim() || DEFAULT_FIRST_NAME);
  const safeOrganization = escapeHtml(input.organizationName?.trim() || 'your program');
  const agentXUrl = toAbsoluteAppUrl('/agent-x', { environment: input.environment });

  return {
    subject: isTeamTrack
      ? `14 Days In: How Is ${safeOrganization}'s NXT1 Workspace Working? ⚡`
      : '14 Days In: How Is Agent X Working for You? ⚡',
    campaignKey: isTeamTrack
      ? 'signup_drip_day14_post_purchase_team'
      : 'signup_drip_day14_post_purchase_athlete',
    html: buildMarketingEmailShell({
      preheader: isTeamTrack
        ? `Two weeks into ${safeOrganization}'s program workspace — here is how to get maximum value.`
        : 'Two weeks into your NXT1 workspace — here is how to get even more value from Agent X.',
      eyebrow: '2-Week Check-In',
      title: '14 Days on NXT1',
      subtitle: isTeamTrack
        ? `Checking in on ${safeOrganization}'s team workspace and staff execution.`
        : 'Checking in on your athlete workflows and personal outputs.',
      introHtml: `
        <p style="margin:0 0 16px 0;font-size:20px;line-height:1.5;color:#101722;">Hi ${safeFirstName},</p>
        <p style="margin:0 0 20px 0;font-size:18px;line-height:1.65;color:#1f2937;">
          You've been using NXT1 for 2 weeks! We wanted to check in and see how your AI workflows are running.
        </p>
      `,
      sectionsHtml: [
        isTeamTrack
          ? `
              <h2 style="margin:0 0 10px 0;font-size:26px;line-height:1.2;color:#111827;font-weight:800;">Maximizing NXT1 for Your Program</h2>
              <p style="margin:0 0 12px 0;font-size:17px;line-height:1.6;color:#1f2937;">
                If your coaches need help importing playbooks into The Lab, creating custom prompt templates, or setting up staff seats, our team is ready to support you.
              </p>
              <div style="background-color:#f0f7ff;border:1px solid #bae0ff;border-left:4px solid #1890ff;border-radius:8px;padding:16px;margin-top:12px;">
                <p style="margin:0 0 4px 0;font-size:16px;font-weight:700;color:#003a8c;">⚽ 🏈 🏀 Works Across All Sports in Your Program</p>
                <p style="margin:0;font-size:15px;line-height:1.5;color:#002366;">Did you know NXT1 supports every sport in your athletic department or club? If you'd like to extend workspace access to other head coaches or teams in your school, let us know!</p>
              </div>
            `
          : `
              <h2 style="margin:0 0 10px 0;font-size:26px;line-height:1.2;color:#111827;font-weight:800;">Getting Maximum Value From NXT1</h2>
              <p style="margin:0 0 16px 0;font-size:17px;line-height:1.6;color:#1f2937;">
                Two weeks in is the perfect time to review your setup and lock in your daily execution habits.
              </p>
              <h3 style="margin:16px 0 10px 0;font-size:20px;line-height:1.3;color:#111827;font-weight:700;">⚡ Key Platform Reminders</h3>
              <ul style="margin:0 0 16px 22px;padding:0;color:#1f2937;">
                <li style="margin:0 0 10px 0;font-size:16px;line-height:1.55;">
                  <strong>Put Tasks on Recurring Schedule:</strong> Set weekly film breakdowns, graphic updates, and progress reports to run on automated schedule so Agent X delivers them automatically.
                </li>
                <li style="margin:0 0 10px 0;font-size:16px;line-height:1.55;">
                  <strong>Keep Your Profile Updated:</strong> Whenever you get new stats, game film, photos, or transcripts, click <strong>"Add Updates"</strong> on your profile so Agent X works from your newest context.
                </li>
                <li style="margin:0 0 10px 0;font-size:16px;line-height:1.55;">
                  <strong>Check Your Daily Briefings:</strong> Open Agent X every day to review proactive daily briefings, active background operations, and recommended next moves.
                </li>
                <li style="margin:0 0 10px 0;font-size:16px;line-height:1.55;">
                  <strong>Use "The Lab" on Desktop:</strong> Need deep document analysis, multi-game trend processing, or playbook breakdown? Launch <strong>"The Lab"</strong> on desktop inside Agent X.
                </li>
                <li style="margin:0;font-size:16px;line-height:1.55;">
                  <strong>Explore "Ask Agent" Prompts:</strong> Tap <strong>"Ask Agent"</strong> for 100s of 1-click coordinator prompts tailored to your sport, media, and training goals.
                </li>
              </ul>
            `,
      ],
      ctaButtons: isTeamTrack
        ? [
            { label: 'Open Program Workspace', href: agentXUrl },
            { label: 'Schedule Program Review', href: 'https://nxt1sports.com/schedule' },
          ]
        : [{ label: 'Open Agent X', href: agentXUrl }],
      footerHtml: `
        <p style="margin:0;font-size:13px;line-height:1.5;color:#b7c5d5;">© 2026 NXT1 Sports. All rights reserved.</p>
        <p style="margin:8px 0 0 0;font-size:12px;line-height:1.5;color:#8ea0b4;">You are receiving this check-in as an active NXT1 workspace member.</p>
      `,
    }),
  };
}

function buildDay30PostPurchaseSurveyVariant(input: SignupDripEmailInput): {
  readonly subject: string;
  readonly html: string;
  readonly campaignKey: string;
} {
  const isTeamTrack = isTeamRole(input.role);
  const safeFirstName = escapeHtml(input.firstName?.trim() || DEFAULT_FIRST_NAME);
  const safeOrganization = escapeHtml(input.organizationName?.trim() || 'your program');

  return {
    subject: isTeamTrack
      ? `Your 30-Day Program Review for ${safeOrganization} 📝`
      : 'Your 30-Day NXT1 Check-In — Help Shape Our Next Features 📝',
    campaignKey: isTeamTrack
      ? 'signup_drip_day30_post_purchase_team'
      : 'signup_drip_day30_post_purchase_athlete',
    html: buildMarketingEmailShell({
      preheader: isTeamTrack
        ? `Schedule a 1-on-1 season review call for ${safeOrganization} with our team.`
        : 'You have been on NXT1 for 30 days. Take our quick survey and receive $5 in free credits!',
      eyebrow: isTeamTrack ? '30-Day Program Review' : '30-Day Member Review',
      title: '30 Days on NXT1',
      subtitle: isTeamTrack
        ? `Schedule a 30-day strategy and review consultation for ${safeOrganization}.`
        : 'Help shape our roadmap with your feedback.',
      introHtml: `
        <p style="margin:0 0 16px 0;font-size:20px;line-height:1.5;color:#101722;">Coach ${safeFirstName},</p>
        <p style="margin:0 0 20px 0;font-size:18px;line-height:1.65;color:#1f2937;">
          ${
            isTeamTrack
              ? `${safeOrganization} has officially been on NXT1 for a full month! We want to make sure your coaching staff is getting maximum value out of Agent X, The Lab, and your workspace.`
              : "You've officially been using NXT1 for a full month! Which Agent X workflows have saved you the most time, and what features should we build next?"
          }
        </p>
      `,
      sectionsHtml: [
        isTeamTrack
          ? `
              <p style="margin:0 0 12px 0;font-size:17px;line-height:1.6;color:#1f2937;">
                Schedule a 1-on-1 strategy and season review call directly with our leadership team so we can review your staff workflows, feature requests, and custom coordinator setups.
              </p>
            `
          : `
              <div style="background-color:#edf8cf;border:1px solid #cfe89b;border-left:4px solid #91c11f;border-radius:8px;padding:16px;margin-top:12px;">
                <p style="margin:0 0 4px 0;font-size:16px;font-weight:700;color:#25320d;">🎁 $5 Free Wallet Credits Bonus</p>
                <p style="margin:0;font-size:15px;line-height:1.5;color:#25320d;">Complete our 30-day survey and we will add <strong>$5 in free credits</strong> to your NXT1 wallet as a thank you!</p>
              </div>
            `,
      ],
      ctaButtons: isTeamTrack
        ? [
            {
              label: 'Schedule 1-on-1 Review Call',
              href: 'https://calendar.app.google/LdFFYqWnFKKqVFn3A',
            },
          ]
        : [{ label: 'Take 30-Day Survey ($5 Credits)', href: SURVEY_FORM_URL }],
      footerHtml: `
        <p style="margin:0;font-size:13px;line-height:1.5;color:#b7c5d5;">© 2026 NXT1 Sports. All rights reserved.</p>
        <p style="margin:8px 0 0 0;font-size:12px;line-height:1.5;color:#8ea0b4;">You are receiving this check-in as a 30-day member of NXT1.</p>
      `,
    }),
  };
}

function buildSignupDripVariant(input: SignupDripEmailInput): {
  readonly subject: string;
  readonly html: string;
  readonly campaignKey: string;
} {
  switch (input.stepKey) {
    case 'profile_setup':
      return buildProfileSetupVariant(input);
    case 'agent_activation':
      return buildAgentActivationVariant(input);
    case 'reengagement':
      return buildReengagementVariant(input);
    case 'day3_inactivity_nudge':
      return buildDay3InactivityVariant(input);
    case 'day7_mid_trial_showcase':
      return buildDay7MidTrialVariant(input);
    case 'day14_pretrial_feedback_no_usage':
      return buildDay14PreTrialFeedbackNoUsageVariant(input);
    case 'day14_pretrial_feedback_has_usage':
      return buildDay14PreTrialFeedbackHasUsageVariant(input);
    case 'day14_post_purchase_checkin':
      return buildDay14PostPurchaseCheckinVariant(input);
    case 'day30_post_purchase_survey':
      return buildDay30PostPurchaseSurveyVariant(input);
  }
}

export async function sendSignupDripEmail(
  input: SignupDripEmailInput
): Promise<SignupDripEmailResult> {
  if (input.marketingEnabled === false) {
    return { status: 'skipped', reason: 'marketing-disabled' };
  }

  const email = input.email?.trim().toLowerCase();
  if (!email) {
    return { status: 'skipped', reason: 'missing-email' };
  }

  const variant = buildSignupDripVariant(input);

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
  } catch (error) {
    logger.error('[MarketingEmail] Signup drip email failed', {
      userId: input.userId,
      email,
      stepKey: input.stepKey,
      paymentState: input.paymentState,
      role: input.role,
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}
