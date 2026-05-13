/**
 * @fileoverview Launch Announcement Marketing Email
 * @module @nxt1/backend/services/marketing/email/campaigns/launch/launch-announcement-email
 */

import { sendOutboundMarketingEmail } from '../../outbound-email.service.js';
import { logger } from '../../../../../utils/logger.js';
import { buildMarketingEmailShell } from '../../templates/marketing-email-shell.js';

const CAMPAIGN_KEY = 'launch_announcement';
const SUBJECT = 'Welcome to the New NXT1 Sports';

interface LaunchAnnouncementEmailInput {
  readonly userId?: string;
  readonly email: string;
  readonly firstName?: string | null;
}

export async function sendLaunchAnnouncementEmail(
  input: LaunchAnnouncementEmailInput
): Promise<void> {
  const html = buildMarketingEmailShell({
    preheader: 'NXT1 is live as the Sports Intelligence Platform powered by Agent X.',
    eyebrow: 'Important Update',
    title: 'Welcome to the New NXT1 Sports',
    subtitle: 'NXT1 is live as the Sports Intelligence Platform powered by Agent X.',
    introHtml: `
      <p style="margin:0 0 16px 0;font-size:20px;line-height:1.5;color:#101722;">
        NXT1 has officially launched as a <strong>Sports Intelligence Platform</strong>.
      </p>
      <p style="margin:0;font-size:19px;line-height:1.65;color:#1f2937;">
        Not a recruiting database. Not a passive profile. Not another sports app that waits for you to do the work.
      </p>
      <p style="margin:16px 0 0 0;font-size:19px;line-height:1.65;color:#1f2937;">
        This is an active command center where Agent X and AI Coordinators help you execute.
      </p>
    `,
    sectionsHtml: [
      `
        <h2 style="margin:0 0 10px 0;font-size:30px;line-height:1.2;color:#111827;font-weight:800;">Why People Will Use It</h2>
        <p style="margin:0 0 14px 0;font-size:18px;line-height:1.65;color:#1f2937;">
          Most platforms make you update information and hope somebody notices. NXT1 flips that model.
          You tell Agent X what you need, and the platform gets to work.
        </p>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;">
          <tr><td style="background-color:#f3f7fb;border:1px solid #d8e3ef;border-radius:10px;padding:16px;border-left:4px solid #ccff00;margin-bottom:12px;">
            <p style="margin:0 0 6px 0;font-size:18px;line-height:1.5;color:#111827;font-weight:800;">See What Matters Immediately</p>
            <p style="margin:0;font-size:17px;line-height:1.6;color:#1f2937;">Start with a daily briefing that surfaces what deserves your attention right now instead of making you hunt through tools and tabs.</p>
          </td></tr>
        </table>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;margin-top:12px;">
          <tr><td style="background-color:#f3f7fb;border:1px solid #d8e3ef;border-radius:10px;padding:16px;border-left:4px solid #ccff00;">
            <p style="margin:0 0 6px 0;font-size:18px;line-height:1.5;color:#111827;font-weight:800;">Operate With A Weekly Game Plan</p>
            <p style="margin:0;font-size:17px;line-height:1.6;color:#1f2937;">Turn your recruiting, content, and performance priorities into one clear action plan you can actually execute.</p>
          </td></tr>
        </table>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;margin-top:12px;">
          <tr><td style="background-color:#f3f7fb;border:1px solid #d8e3ef;border-radius:10px;padding:16px;border-left:4px solid #ccff00;">
            <p style="margin:0 0 6px 0;font-size:18px;line-height:1.5;color:#111827;font-weight:800;">Create Like You Have A Full Staff</p>
            <p style="margin:0;font-size:17px;line-height:1.6;color:#1f2937;">Generate highlight reels, weekly graphics, social-ready creative, film breakdowns, and polished assets from a single command center.</p>
          </td></tr>
        </table>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;margin-top:12px;">
          <tr><td style="background-color:#f3f7fb;border:1px solid #d8e3ef;border-radius:10px;padding:16px;border-left:4px solid #ccff00;">
            <p style="margin:0 0 6px 0;font-size:18px;line-height:1.5;color:#111827;font-weight:800;">Execute Real Sports Workflows</p>
            <p style="margin:0;font-size:17px;line-height:1.6;color:#1f2937;">Draft outreach, keep profiles recruitment-ready, track warm leads, analyze rosters, review compliance, and build smarter practice or game plans.</p>
          </td></tr>
        </table>
      `,
      `
        <h2 style="margin:0 0 10px 0;font-size:30px;line-height:1.2;color:#111827;font-weight:800;">The Category Shift</h2>
        <ul style="margin:0 0 0 22px;padding:0;color:#1f2937;">
          <li style="margin:0 0 10px 0;font-size:18px;line-height:1.55;"><strong>The old way:</strong> build a profile, update your stats, and wait</li>
          <li style="margin:0 0 10px 0;font-size:18px;line-height:1.55;"><strong>The NXT1 way:</strong> command Agent X, delegate execution, and stay in motion</li>
          <li style="margin:0;font-size:18px;line-height:1.55;"><strong>Your advantage:</strong> more output, sharper decisions, and less wasted manual work</li>
        </ul>
      `,
      `
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;">
          <tr>
            <td style="background-color:rgba(204,255,0,0.08);border:1px solid rgba(204,255,0,0.22);border-left:4px solid #ccff00;border-radius:8px;padding:16px;">
              <p style="margin:0;font-size:18px;line-height:1.65;color:#111827;"><strong>Most platforms are passive.</strong> You update your profile and wait. <strong>NXT1 is active.</strong> You give the command. Agent X gets to work.</p>
            </td>
          </tr>
        </table>
      `,
      `
        <h2 style="margin:0 0 10px 0;font-size:30px;line-height:1.2;color:#111827;font-weight:800;">Start Here</h2>
        <p style="margin:0 0 16px 0;font-size:18px;line-height:1.65;color:#1f2937;">
          Open Agent X and feel the difference between a platform that stores information and one that helps you execute.
          This is where sports intelligence becomes daily action.
        </p>
        <p style="margin:0 0 12px 0;font-size:17px;line-height:1.55;color:#1f2937;">
          Whether you are an athlete, coach, director, parent, or program leader, NXT1 is built for people who want to move faster,
          look sharper, communicate better, and operate at a Grade A+ standard.
        </p>
      `,
    ],
    ctaButtons: [
      {
        label: 'Open Agent X',
        href: 'https://nxt1sports.com/agent-x',
      },
      {
        label: 'Visit Help Center',
        href: 'https://nxt1sports.com/help-center',
        variant: 'secondary',
      },
    ],
    footerHtml: `
      <p style="margin:0;font-size:13px;line-height:1.5;color:#b7c5d5;">© 2026 NXT1 Sports. All rights reserved.</p>
      <p style="margin:8px 0 0 0;font-size:12px;line-height:1.5;color:#8ea0b4;">You are receiving this email because you are part of the NXT1 community.</p>
    `,
  });

  try {
    await sendOutboundMarketingEmail({
      to: input.email.trim().toLowerCase(),
      subject: SUBJECT,
      html,
      campaignKey: CAMPAIGN_KEY,
      userId: input.userId,
      replyTo: 'support@nxt1sports.com',
    });
  } catch (err) {
    logger.error('[MarketingEmail] Launch announcement email failed', {
      userId: input.userId,
      email: input.email,
      error: err instanceof Error ? err.message : String(err),
    });
    throw err;
  }
}
