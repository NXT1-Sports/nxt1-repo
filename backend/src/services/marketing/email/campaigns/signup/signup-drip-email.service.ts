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
    return input.setupFocusAreas;
  }

  return isTeamTrack
    ? [
        'Lock in your program context so workflows map to the right roster and sport.',
        'Upload or connect the assets your staff will use every week.',
        'Give Agent X one real operations task so it starts working from your actual team flow.',
      ]
    : [
        'Add the profile details that help people understand who you are right away.',
        'Upload or organize the media that best represents your progress.',
        'Connect the sources and context that make Agent X more useful for your next steps.',
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
      sectionsHtml: [
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
  const agentXUrl = toAbsoluteAppUrl('/agent-x', { environment: input.environment });
  const helpCenterUrl = toAbsoluteAppUrl('/help-center', { environment: input.environment });

  return {
    subject: isTeamTrack
      ? 'Put Agent X on one real team workflow this week'
      : 'Put Agent X on one real athlete workflow this week',
    campaignKey: isTeamTrack
      ? 'signup_drip_agent_activation_team'
      : 'signup_drip_agent_activation_athlete',
    html: buildMarketingEmailShell({
      preheader: 'NXT1 becomes real when Agent X handles work you would otherwise do manually.',
      eyebrow: 'Agent X',
      title: 'Put Agent X on Real Work',
      subtitle: isTeamTrack
        ? 'One serious team workflow is enough to show whether NXT1 can save staff time and sharpen execution.'
        : 'One serious workflow is enough to show whether NXT1 can save time and sharpen execution.',
      introHtml: `
        <p style="margin:0 0 16px 0;font-size:20px;line-height:1.5;color:#101722;">Hi ${safeFirstName},</p>
        <p style="margin:0 0 20px 0;font-size:18px;line-height:1.65;color:#1f2937;">
          NXT1 stops feeling theoretical the moment Agent X handles real work. Start with one task you would normally have to organize, write, or plan yourself.
        </p>
      `,
      sectionsHtml: [
        isTeamTrack
          ? `
              <h2 style="margin:0 0 10px 0;font-size:30px;line-height:1.2;color:#111827;font-weight:800;">Strong First Prompts for Team Staff</h2>
              <ul style="margin:0 0 8px 22px;padding:0;color:#1f2937;">
                <li style="margin:0 0 10px 0;font-size:18px;line-height:1.55;">Build this week's recruiting, operations, or communication checklist.</li>
                <li style="margin:0 0 10px 0;font-size:18px;line-height:1.55;">Turn scattered team information into one staff action plan.</li>
                <li style="margin:0;font-size:18px;line-height:1.55;">Draft a workflow your staff can actually run this week.</li>
              </ul>
            `
          : `
              <h2 style="margin:0 0 10px 0;font-size:30px;line-height:1.2;color:#111827;font-weight:800;">Strong First Prompts for Athletes</h2>
              <ul style="margin:0 0 8px 22px;padding:0;color:#1f2937;">
                <li style="margin:0 0 10px 0;font-size:18px;line-height:1.55;">Build a weekly action plan for training, visibility, and communication.</li>
                <li style="margin:0 0 10px 0;font-size:18px;line-height:1.55;">Organize a better outreach or follow-up workflow.</li>
                <li style="margin:0;font-size:18px;line-height:1.55;">Turn the next 30 days into a clear execution plan.</li>
              </ul>
            `,
        `
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;">
            <tr>
              <td style="background-color:#edf8cf;border:1px solid #cfe89b;border-left:4px solid #91c11f;border-radius:8px;padding:14px;">
                <p style="margin:0;font-size:16px;line-height:1.55;color:#25320d;"><strong>Best test:</strong> give Agent X a real task with a real deadline. You will know very quickly whether it is saving you time or improving the quality of execution.</p>
              </td>
            </tr>
          </table>
        `,
      ],
      ctaButtons: [
        { label: 'Open Agent X', href: agentXUrl },
        { label: 'Help Center', href: helpCenterUrl, variant: 'secondary' },
      ],
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
  const agentXUrl = toAbsoluteAppUrl('/agent-x', { environment: input.environment });
  const paidState = input.paymentState === 'paid' || input.paymentState === 'org-covered';

  return {
    subject: paidState
      ? isTeamTrack
        ? 'You are set up. Now make NXT1 part of your staff workflow'
        : 'You are set up. Now make NXT1 part of your weekly workflow'
      : isTeamTrack
        ? 'You have seen the foundation. Here is how to get more from NXT1'
        : 'You have seen the foundation. Here is how to get more from NXT1',
    campaignKey: paidState
      ? isTeamTrack
        ? 'signup_drip_reengagement_paid_team'
        : 'signup_drip_reengagement_paid_athlete'
      : isTeamTrack
        ? 'signup_drip_reengagement_unpaid_team'
        : 'signup_drip_reengagement_unpaid_athlete',
    html: buildMarketingEmailShell({
      preheader: paidState
        ? 'Setup is done. The next step is making NXT1 part of how you operate every week.'
        : 'If the early value is real, this is the point to decide how much of your workflow belongs in NXT1.',
      eyebrow: 'NXT1 Momentum',
      title: paidState ? 'Turn Setup Into Habit' : 'Decide How Deep NXT1 Fits',
      subtitle: paidState
        ? isTeamTrack
          ? 'The return comes when NXT1 becomes part of how your staff actually operates.'
          : 'The return comes when NXT1 becomes part of how you actually operate each week.'
        : 'If the early value is real, the next move is deeper usage on real work.',
      introHtml: `
        <p style="margin:0 0 16px 0;font-size:20px;line-height:1.5;color:#101722;">Hi ${safeFirstName},</p>
        <p style="margin:0 0 20px 0;font-size:18px;line-height:1.65;color:#1f2937;">
          ${
            paidState
              ? isTeamTrack
                ? 'Your foundation is in place. Now the goal is to make NXT1 part of the weekly staff rhythm so the value compounds instead of staying at setup level.'
                : 'Your foundation is in place. Now the goal is to make NXT1 part of your weekly rhythm so the value compounds instead of staying at setup level.'
              : isTeamTrack
                ? 'If NXT1 is already helping your program get more organized, more visible, or more efficient, this is the point to decide whether it should take on a bigger operational role.'
                : 'If NXT1 is already helping you get more organized, more visible, or more efficient, this is the point to decide whether it should take on a bigger role in your workflow.'
          }
        </p>
      `,
      sectionsHtml: [
        paidState
          ? `
              <h2 style="margin:0 0 10px 0;font-size:30px;line-height:1.2;color:#111827;font-weight:800;">What to Do Next</h2>
              <ul style="margin:0 0 8px 22px;padding:0;color:#1f2937;">
                <li style="margin:0 0 10px 0;font-size:18px;line-height:1.55;">Run one meaningful workflow through Agent X this week.</li>
                <li style="margin:0 0 10px 0;font-size:18px;line-height:1.55;">Tighten the information NXT1 is using so the output gets sharper.</li>
                <li style="margin:0;font-size:18px;line-height:1.55;">Make NXT1 part of your normal weekly operating rhythm, not a one-time setup.</li>
              </ul>
            `
          : `
              <h2 style="margin:0 0 10px 0;font-size:30px;line-height:1.2;color:#111827;font-weight:800;">How to Tell If It Is Worth Going Deeper</h2>
              <ul style="margin:0 0 8px 22px;padding:0;color:#1f2937;">
                <li style="margin:0 0 10px 0;font-size:18px;line-height:1.55;">Finish the core setup so NXT1 has real context to work from.</li>
                <li style="margin:0 0 10px 0;font-size:18px;line-height:1.55;">Use Agent X on one live task with a real deadline.</li>
                <li style="margin:0;font-size:18px;line-height:1.55;">If it saves time or improves execution, make it a bigger part of your system.</li>
              </ul>
            `,
        `
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;">
            <tr>
              <td style="background-color:#edf8cf;border:1px solid #cfe89b;border-left:4px solid #91c11f;border-radius:8px;padding:14px;">
                <p style="margin:0;font-size:16px;line-height:1.55;color:#25320d;"><strong>Rule of thumb:</strong> if NXT1 is already helping you move faster or make better decisions, the next step is not more browsing. It is deeper use on work that matters.</p>
              </td>
            </tr>
          </table>
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
      : '3 Quick Prompts to Get Your First Agent X Breakdown 🎬',
    campaignKey: isTeamTrack
      ? 'signup_drip_day3_inactivity_team'
      : 'signup_drip_day3_inactivity_athlete',
    html: buildMarketingEmailShell({
      preheader: 'Get your first Agent X deliverable in under 2 minutes.',
      eyebrow: 'Quick Start',
      title: 'Run Your First 1-Click Workflow',
      subtitle: isTeamTrack
        ? 'Save hours on coaching ops, scout reports, and roster management.'
        : 'Get instant film breakdowns, highlight graphics, and outreach templates.',
      introHtml: `
        <p style="margin:0 0 16px 0;font-size:20px;line-height:1.5;color:#101722;">Hi ${safeFirstName},</p>
        <p style="margin:0 0 20px 0;font-size:18px;line-height:1.65;color:#1f2937;">
          We noticed you haven't executed your first Agent X workflow yet. Here are 3 starter prompts you can run with 1 click right now:
        </p>
      `,
      sectionsHtml: [
        isTeamTrack
          ? `
              <ul style="margin:0 0 8px 22px;padding:0;color:#1f2937;">
                <li style="margin:0 0 10px 0;font-size:18px;line-height:1.55;"><strong>Opponent Scout Outline:</strong> "Generate a 1-page opponent evaluation structure."</li>
                <li style="margin:0 0 10px 0;font-size:18px;line-height:1.55;"><strong>Team Communication:</strong> "Draft a weekly schedule update for players and parents."</li>
                <li style="margin:0;font-size:18px;line-height:1.55;"><strong>Roster Graphic:</strong> "Create a clean graphic announcement for team leaders."</li>
              </ul>
            `
          : `
              <ul style="margin:0 0 8px 22px;padding:0;color:#1f2937;">
                <li style="margin:0 0 10px 0;font-size:18px;line-height:1.55;"><strong>Film Breakdown:</strong> "Paste your Hudl link for instant key game highlights."</li>
                <li style="margin:0 0 10px 0;font-size:18px;line-height:1.55;"><strong>Athletic Resume:</strong> "Organize my stats and GPA into a clean coach overview."</li>
                <li style="margin:0;font-size:18px;line-height:1.55;"><strong>Coach Email:</strong> "Draft an outreach email for college recruiter contact."</li>
              </ul>
            `,
      ],
      ctaButtons: [{ label: 'Try 1-Click Prompt', href: agentXUrl }],
      footerHtml: `
        <p style="margin:0;font-size:13px;line-height:1.5;color:#b7c5d5;">© 2026 NXT1 Sports. All rights reserved.</p>
        <p style="margin:8px 0 0 0;font-size:12px;line-height:1.5;color:#8ea0b4;">You are receiving this tip because you recently created a NXT1 account.</p>
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
  const agentXUrl = toAbsoluteAppUrl('/agent-x', { environment: input.environment });

  return {
    subject: isTeamTrack
      ? 'Coach, Try These 2 Advanced Program Workflows ⚡'
      : 'Unlock 2 Advanced Agent X Workflows This Week ⚡',
    campaignKey: isTeamTrack
      ? 'signup_drip_day7_mid_trial_team'
      : 'signup_drip_day7_mid_trial_athlete',
    html: buildMarketingEmailShell({
      preheader: 'Get the most value out of your remaining trial credits.',
      eyebrow: 'Mid-Trial Power Workflows',
      title: 'Take Agent X To The Next Level',
      subtitle: 'Try these power prompts before your trial credits run out.',
      introHtml: `
        <p style="margin:0 0 16px 0;font-size:20px;line-height:1.5;color:#101722;">Hi ${safeFirstName},</p>
        <p style="margin:0 0 20px 0;font-size:18px;line-height:1.65;color:#1f2937;">
          You've started using Agent X — now try 2 higher-tier workflows designed to get maximum value out of your trial:
        </p>
      `,
      sectionsHtml: [
        isTeamTrack
          ? `
              <ul style="margin:0 0 8px 22px;padding:0;color:#1f2937;">
                <li style="margin:0 0 10px 0;font-size:18px;line-height:1.55;"><strong>Multi-Game Trend Analysis:</strong> Combine stat sheets across games to spot staff insights.</li>
                <li style="margin:0;font-size:18px;line-height:1.55;"><strong>AI Graphic Studio:</strong> Generate branded graphic assets for game day match-ups.</li>
              </ul>
            `
          : `
              <ul style="margin:0 0 8px 22px;padding:0;color:#1f2937;">
                <li style="margin:0 0 10px 0;font-size:18px;line-height:1.55;"><strong>Highlight Graphic Generator:</strong> Enhance your best game photos with custom templates.</li>
                <li style="margin:0;font-size:18px;line-height:1.55;"><strong>Coach Outreach Campaign:</strong> Build a multi-step communication sequence for recruiters.</li>
              </ul>
            `,
      ],
      ctaButtons: [{ label: 'Try Power Workflows', href: agentXUrl }],
      footerHtml: `
        <p style="margin:0;font-size:13px;line-height:1.5;color:#b7c5d5;">© 2026 NXT1 Sports. All rights reserved.</p>
        <p style="margin:8px 0 0 0;font-size:12px;line-height:1.5;color:#8ea0b4;">You are receiving this tip as an active NXT1 trial user.</p>
      `,
    }),
  };
}

function buildDay14PreTrialFeedbackNoUsageVariant(input: SignupDripEmailInput): {
  readonly subject: string;
  readonly html: string;
  readonly campaignKey: string;
} {
  const safeFirstName = escapeHtml(input.firstName?.trim() || DEFAULT_FIRST_NAME);
  const helpCenterUrl = toAbsoluteAppUrl('/help-center', { environment: input.environment });

  return {
    subject: `Quick Question About NXT1, ${safeFirstName} ❓`,
    campaignKey: 'signup_drip_day14_feedback_no_usage',
    html: buildMarketingEmailShell({
      preheader: 'Help us understand what blocked you from getting started on NXT1.',
      eyebrow: 'Product Feedback',
      title: 'What Blocked You From Getting Started?',
      subtitle: 'We build NXT1 for real work. Tell us what we can do better.',
      introHtml: `
        <p style="margin:0 0 16px 0;font-size:20px;line-height:1.5;color:#101722;">Hi ${safeFirstName},</p>
        <p style="margin:0 0 20px 0;font-size:18px;line-height:1.65;color:#1f2937;">
          We noticed you created an account 2 weeks ago, but haven't run your first Agent X workflow.
          We would love your quick 30-second input so we can improve:
        </p>
      `,
      sectionsHtml: [
        `
          <ul style="margin:0 0 8px 22px;padding:0;color:#1f2937;">
            <li style="margin:0 0 10px 0;font-size:18px;line-height:1.55;">Was the setup or onboarding confusing?</li>
            <li style="margin:0 0 10px 0;font-size:18px;line-height:1.55;">Were you missing a specific sport, feature, or integration?</li>
            <li style="margin:0;font-size:18px;line-height:1.55;">Did you run out of time?</li>
          </ul>
          <p style="margin:16px 0 0 0;font-size:18px;line-height:1.65;color:#1f2937;">
            Simply reply directly to this email or visit our help center. Our team reads every message!
          </p>
        `,
      ],
      ctaButtons: [{ label: 'Visit Help Center', href: helpCenterUrl }],
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
  const safeFirstName = escapeHtml(input.firstName?.trim() || DEFAULT_FIRST_NAME);
  const helpCenterUrl = toAbsoluteAppUrl('/help-center', { environment: input.environment });

  return {
    subject: `How Did Your First Agent X Tasks Go, ${safeFirstName}? 💬`,
    campaignKey: 'signup_drip_day14_feedback_has_usage',
    html: buildMarketingEmailShell({
      preheader: "We'd love to know how your first Agent X workflows went.",
      eyebrow: 'Product Experience',
      title: 'How Were Your First Workflows?',
      subtitle: 'Your feedback directly drives our feature updates.',
      introHtml: `
        <p style="margin:0 0 16px 0;font-size:20px;line-height:1.5;color:#101722;">Hi ${safeFirstName},</p>
        <p style="margin:0 0 20px 0;font-size:18px;line-height:1.65;color:#1f2937;">
          You ran a few workflows on NXT1, but haven't completed your trial or upgraded.
          We want to make sure NXT1 delivers maximum value for your sport:
        </p>
      `,
      sectionsHtml: [
        `
          <p style="margin:0 0 12px 0;font-size:18px;line-height:1.65;color:#1f2937;">
            Did the output meet your expectations? Is there a feature or workflow you wish Agent X could handle?
          </p>
          <p style="margin:0;font-size:18px;line-height:1.65;color:#1f2937;">
            Reply directly to this email with your thoughts — we build NXT1 based on real user feedback.
          </p>
        `,
      ],
      ctaButtons: [{ label: 'Contact Support', href: helpCenterUrl }],
      footerHtml: `
        <p style="margin:0;font-size:13px;line-height:1.5;color:#b7c5d5;">© 2026 NXT1 Sports. All rights reserved.</p>
        <p style="margin:8px 0 0 0;font-size:12px;line-height:1.5;color:#8ea0b4;">You are receiving this feedback check-in as a NXT1 user.</p>
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
      preheader: 'Two weeks into your NXT1 subscription — here is how to get even more value.',
      eyebrow: '2-Week Check-In',
      title: '14 Days On NXT1 Pro',
      subtitle: isTeamTrack
        ? `Checking in on ${safeOrganization}'s team workspace and staff execution.`
        : 'Checking in on your athlete workflows and personal outputs.',
      introHtml: `
        <p style="margin:0 0 16px 0;font-size:20px;line-height:1.5;color:#101722;">Hi ${safeFirstName},</p>
        <p style="margin:0 0 20px 0;font-size:18px;line-height:1.65;color:#1f2937;">
          You've been on NXT1 Pro for 2 weeks! We wanted to check in and see how your workflows are running.
        </p>
      `,
      sectionsHtml: [
        `
          <h2 style="margin:0 0 10px 0;font-size:30px;line-height:1.2;color:#111827;font-weight:800;">Need VIP Support or Strategy?</h2>
          <p style="margin:0;font-size:18px;line-height:1.65;color:#1f2937;">
            If you need custom prompt templates, batch export assistance, or team roster setup, simply reply to this email to get direct help from our team.
          </p>
        `,
      ],
      ctaButtons: [{ label: 'Open Agent X', href: agentXUrl }],
      footerHtml: `
        <p style="margin:0;font-size:13px;line-height:1.5;color:#b7c5d5;">© 2026 NXT1 Sports. All rights reserved.</p>
        <p style="margin:8px 0 0 0;font-size:12px;line-height:1.5;color:#8ea0b4;">You are receiving this check-in as an active NXT1 subscriber.</p>
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
  const helpCenterUrl = toAbsoluteAppUrl('/help-center', { environment: input.environment });

  return {
    subject: isTeamTrack
      ? 'Your 30-Day NXT1 Program Review — Help Shape Our Next Features 📝'
      : 'Your 30-Day NXT1 Check-In — Help Shape Our Next Features 📝',
    campaignKey: isTeamTrack
      ? 'signup_drip_day30_post_purchase_team'
      : 'signup_drip_day30_post_purchase_athlete',
    html: buildMarketingEmailShell({
      preheader: 'You have been on NXT1 for 30 days. Tell us what we should build next.',
      eyebrow: '30-Day Member Review',
      title: '30 Days On NXT1',
      subtitle: 'Help shape our roadmap with your feedback.',
      introHtml: `
        <p style="margin:0 0 16px 0;font-size:20px;line-height:1.5;color:#101722;">Hi ${safeFirstName},</p>
        <p style="margin:0 0 20px 0;font-size:18px;line-height:1.65;color:#1f2937;">
          You've officially been using NXT1 for a full month! What features have saved you the most time, and what would you like us to build next?
        </p>
      `,
      sectionsHtml: [
        `
          <p style="margin:0;font-size:18px;line-height:1.65;color:#1f2937;">
            Reply to this email with your feedback, feature requests, or a quick review of your experience so far!
          </p>
        `,
      ],
      ctaButtons: [{ label: 'Send Feedback', href: helpCenterUrl }],
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
