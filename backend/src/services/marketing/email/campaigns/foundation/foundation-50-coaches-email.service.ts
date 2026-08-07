/**
 * @fileoverview Foundation 50 Coaches Campaign Email
 * @module @nxt1/backend/services/marketing/email/campaigns/foundation/foundation-50-coaches-email
 *
 * Exclusive founding group campaign for HS coaches.
 * Focused on operational simplicity ("one system, not five") + intelligence over storage + community prestige.
 * Deadline: July 31, 2026
 */

import { sendOutboundMarketingEmail } from '../../outbound-email.service.js';
import { logger } from '../../../../../utils/logger.js';
import type { RuntimeEnvironment } from '../../../../../config/runtime-environment.js';
import { buildMarketingEmailShell } from '../../templates/marketing-email-shell.js';

const DEFAULT_FIRST_NAME = 'Coach';
const COACH_CAMPAIGN_IMAGE_URL =
  'https://storage.googleapis.com/nxt-1-v2.firebasestorage.app/email-assets/email-campaign-coach.png';
const FOUNDATION_50_CAMPAIGN_KEY = 'foundation_50_coaches';
const FOUNDATION_50_CALENDAR_HREF = 'https://calendar.app.google/LdFFYqWnFKKqVFn3A';
const FOUNDATION_50_SITE_HREF = 'https://nxt1sports.com';

interface Foundation50CoachesEmailInput {
  readonly userId?: string;
  readonly email: string;
  readonly firstName?: string | null;
  readonly environment: RuntimeEnvironment;
  readonly primarySport?: string | null;
  readonly organizationName?: string | null;
  readonly coachTestimonial?: {
    readonly name: string;
    readonly school: string;
    readonly quote: string;
  };
}

interface Foundation50EmailVariant {
  readonly subject: string;
  readonly campaignKey: string;
  readonly html: string;
}

function withUtm(
  url: string,
  input: {
    readonly campaign: string;
    readonly content: string;
    readonly term?: string;
  }
): string {
  const trackingUrl = new URL(url);
  trackingUrl.searchParams.set('utm_source', 'email');
  trackingUrl.searchParams.set('utm_medium', 'outbound');
  trackingUrl.searchParams.set('utm_campaign', input.campaign);
  trackingUrl.searchParams.set('utm_content', input.content);
  if (input.term) {
    trackingUrl.searchParams.set('utm_term', input.term);
  }
  return trackingUrl.toString();
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function buildCoachVariant(args: {
  readonly firstName: string;
  readonly primarySport?: string | null;
  readonly organizationName?: string | null;
  readonly coachTestimonial?: {
    readonly name: string;
    readonly school: string;
    readonly quote: string;
  };
}): Foundation50EmailVariant {
  const firstName = escapeHtml(args.firstName);
  const calendarHref = withUtm(FOUNDATION_50_CALENDAR_HREF, {
    campaign: FOUNDATION_50_CAMPAIGN_KEY,
    content: 'schedule_founder_meeting',
    term: 'initial',
  });
  const siteHref = withUtm(FOUNDATION_50_SITE_HREF, {
    campaign: FOUNDATION_50_CAMPAIGN_KEY,
    content: 'visit_nxt1_site',
    term: 'initial',
  });

  const testimonialHtml = args.coachTestimonial
    ? `
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;margin-top:12px;">
        <tr><td style="background-color:#f3f7fb;border:1px solid #d8e3ef;border-left:4px solid #ccff00;border-radius:10px;padding:16px;">
          <p style="margin:0 0 8px 0;font-size:17px;line-height:1.6;color:#1f2937;font-style:italic;">"${escapeHtml(args.coachTestimonial.quote)}"</p>
          <p style="margin:0;font-size:16px;line-height:1.5;color:#4b5563;font-weight:600;">— ${escapeHtml(args.coachTestimonial.name)}, ${escapeHtml(args.coachTestimonial.school)}</p>
        </td></tr>
      </table>
    `
    : '';

  return {
    subject: 'The 50 Coaches Building a Cleaner System This Season',
    campaignKey: FOUNDATION_50_CAMPAIGN_KEY,
    html: buildMarketingEmailShell({
      preheader: 'Not another tool. One operating system for your entire program.',
      eyebrow: 'FOUNDATION 50 COACHES',
      title: 'Operating Different This Season',
      subtitle:
        'Exclusive invite: Become one of 50 founding coaches on a revolutionary platform that gives you your program back.',
      introHtml: `
        <p style="margin:0 0 16px 0;font-size:20px;line-height:1.5;color:#101722;">Hi ${firstName},</p>
        <p style="margin:0 0 16px 0;font-size:18px;line-height:1.55;color:#101722;">
          Most HS coaches are still juggling it:
        </p>
        <ul style="margin:0 0 16px 0;margin-left:22px;padding:0;font-size:18px;line-height:1.6;color:#1f2937;">
          <li style="margin:0 0 8px 0;">Film in one place (Hudl)</li>
          <li style="margin:0 0 8px 0;">Team communication in another (GroupMe, email)</li>
          <li style="margin:0 0 8px 0;">Roster and stats scattered across sheets</li>
          <li style="margin:0 0 8px 0;">Scout reports written on paper or in docs</li>
          <li style="margin:0;color:#666;">Admin work stealing your Sundays, your evenings, your time</li>
        </ul>
        <p style="margin:0 0 16px 0;font-size:18px;line-height:1.65;color:#1f2937;font-weight:700;">That is not coaching. That is IT management.</p>
        <p style="margin:0 0 16px 0;font-size:18px;line-height:1.65;color:#1f2937;">
          Coaches do not need another dashboard. Coaches need time back.
        </p>
        <p style="margin:0;font-size:18px;line-height:1.65;color:#1f2937;">
          NXT1 is the first platform built as an AI agent staff for sports programs.
          <strong>It handles recurring prep and admin so you can spend more time coaching and less time managing busywork.</strong>
        </p>
      `,
      sectionsHtml: [
        `
          <h2 style="margin:0 0 20px 0;font-size:30px;line-height:1.15;color:#111827;font-weight:800;">Your AI 24/7 Digital Coaching Staff</h2>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;margin-bottom:20px;">
            <tr><td align="center" style="background-color:#f3f7fb;border-radius:10px;padding:0;overflow:hidden;">
              <img src="${COACH_CAMPAIGN_IMAGE_URL}" alt="NXT1 Platform Dashboard" style="display:block;width:100%;height:auto;max-width:600px;" />
            </td></tr>
          </table>
        `,
        `
          <h2 style="margin:0 0 10px 0;font-size:30px;line-height:1.15;color:#111827;font-weight:800;">One Operating System</h2>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;">
            <tr><td style="background-color:#f3f7fb;border:1px solid #d8e3ef;border-left:4px solid #ccff00;border-radius:10px;padding:16px;">
              <p style="margin:0 0 6px 0;font-size:18px;line-height:1.5;color:#111827;font-weight:800;">Film review + AI-powered breakdown</p>
              <p style="margin:0;font-size:17px;line-height:1.6;color:#1f2937;">No Hudl switching. See your film, annotate footage, tag moments, get AI-powered scene analysis—all in one place. Just ask for a report. Done.</p>
            </td></tr>
          </table>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;margin-top:12px;">
            <tr><td style="background-color:#f3f7fb;border:1px solid #d8e3ef;border-left:4px solid #ccff00;border-radius:10px;padding:16px;">
              <p style="margin:0 0 6px 0;font-size:18px;line-height:1.5;color:#111827;font-weight:800;">Weekly prep and planning on autopilot</p>
              <p style="margin:0;font-size:17px;line-height:1.6;color:#1f2937;">Offload game-plan prep, practice planning, and routine staff follow-ups to your AI agent staff so coaches can focus on player development and execution.</p>
            </td></tr>
          </table>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;margin-top:12px;">
            <tr><td style="background-color:#f3f7fb;border:1px solid #d8e3ef;border-left:4px solid #ccff00;border-radius:10px;padding:16px;">
              <p style="margin:0 0 6px 0;font-size:18px;line-height:1.5;color:#111827;font-weight:800;">Team workspace unified</p>
              <p style="margin:0;font-size:17px;line-height:1.6;color:#1f2937;">Roster, communication, priorities, calendar—all connected so your staff moves as one system. Ask for anything. It's all there.</p>
            </td></tr>
          </table>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;margin-top:12px;">
            <tr><td style="background-color:#f3f7fb;border:1px solid #d8e3ef;border-left:4px solid #ccff00;border-radius:10px;padding:16px;">
              <p style="margin:0 0 6px 0;font-size:18px;line-height:1.5;color:#111827;font-weight:800;">Agent X gives you your time back</p>
              <p style="margin:0;font-size:17px;line-height:1.6;color:#1f2937;">Handles all admin work, writes scout summaries, organizes thinking. Just ask. What used to take 2 hours on a Sunday takes 20 minutes. Your Sundays. Your time. Back.</p>
            </td></tr>
          </table>
        `,
        `
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;">
            <tr>
              <td style="background-color:#fff3cd;border:2px solid #ccff00;border-radius:8px;padding:16px;">
                <p style="margin:0;font-size:18px;line-height:1.65;color:#111827;font-weight:700;text-align:center;">THIS MONTH ONLY</p>
                <p style="margin:8px 0 0 0;font-size:18px;line-height:1.65;color:#1f2937;text-align:center;">Foundation 50 closes July 31, 2026.<br/>After that, this group is done. Next intake in January.</p>
              </td>
            </tr>
          </table>
        `,
        `
          <h2 style="margin:0 0 14px 0;font-size:28px;line-height:1.15;color:#111827;font-weight:800;">The Founding 50</h2>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;">
            <tr>
              <td style="background-color:rgba(204,255,0,0.08);border:1px solid rgba(204,255,0,0.22);border-left:4px solid #ccff00;border-radius:8px;padding:16px;">
                <p style="margin:0 0 10px 0;font-size:18px;line-height:1.65;color:#111827;font-weight:700;">We are looking for coaches who are not waiting for the perfect system. They are building the standard now.</p>
                <p style="margin:0;font-size:17px;line-height:1.6;color:#1f2937;">Being first means:</p>
              </td>
            </tr>
          </table>
          <ul style="margin:12px 0 0 22px;padding:0;font-size:17px;line-height:1.6;color:#1f2937;">
            <li style="margin:0 0 8px 0;">✓ First, you get a free $100 donated budget directly from us</li>
            <li style="margin:0 0 8px 0;">✓ Exclusive coaching group (closed after 50)</li>
            <li style="margin:0 0 8px 0;">✓ Direct access to our product team for your specific needs</li>
            <li style="margin:0 0 8px 0;">✓ Monthly coaching workshop (best practices + live Q&A)</li>
            <li style="margin:0;">✓ You shape what NXT1 becomes for high school programs</li>
          </ul>
          ${testimonialHtml}
        `,
        `
          <h2 style="margin:0 0 20px 0;font-size:30px;line-height:1.15;color:#111827;font-weight:800;">Join the Foundation 50</h2>
          <p style="margin:0 0 12px 0;font-size:18px;line-height:1.65;color:#1f2937;">Be part of the new era of coaching and get your time back like never before. Here is how:</p>
          <p style="margin:0 0 20px 0;font-size:18px;line-height:1.65;color:#1f2937;">You have three options:</p>
          
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;margin-bottom:16px;">
            <tr><td style="background-color:#f3f7fb;border:1px solid #d8e3ef;border-left:4px solid #ccff00;border-radius:10px;padding:16px;">
              <p style="margin:0 0 10px 0;font-size:18px;line-height:1.5;color:#111827;font-weight:700;">1. Reply to this email</p>
              <p style="margin:0;font-size:17px;line-height:1.6;color:#1f2937;">Just reply directly. One line. Say "I'm in." We'll get you onboarded immediately.</p>
            </td></tr>
          </table>
          
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;margin-bottom:16px;">
            <tr><td style="background-color:#f3f7fb;border:1px solid #d8e3ef;border-left:4px solid #ccff00;border-radius:10px;padding:16px;">
              <p style="margin:0 0 10px 0;font-size:18px;line-height:1.5;color:#111827;font-weight:700;">2. Schedule Meeting with Founder</p>
              <p style="margin:0;font-size:17px;line-height:1.6;color:#1f2937;">Direct conversation. <a href="${calendarHref}" style="color:#1f2937;text-decoration:underline;font-weight:600;">Let's talk about how Foundation 50 works for your program.</a></p>
            </td></tr>
          </table>
          
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;">
            <tr><td style="background-color:#f3f7fb;border:1px solid #d8e3ef;border-left:4px solid #ccff00;border-radius:10px;padding:16px;">
              <p style="margin:0 0 10px 0;font-size:18px;line-height:1.5;color:#111827;font-weight:700;">3. Visit nxt1sports.com</p>
              <p style="margin:0;font-size:17px;line-height:1.6;color:#1f2937;"><a href="${siteHref}" style="color:#1f2937;text-decoration:underline;font-weight:600;">Explore the full platform and Foundation 50 details.</a></p>
            </td></tr>
          </table>
        `,
      ],
      ctaButtons: [],
      footerHtml: `
        <p style="margin:0;font-size:13px;line-height:1.5;color:#b7c5d5;">© 2026 NXT1 Sports. All rights reserved.</p>
        <p style="margin:8px 0 0 0;font-size:12px;line-height:1.5;color:#8ea0b4;">Questions? Reply to this email or visit nxt1sports.com</p>
      `,
    }),
  };
}

function buildFoundation50EmailVariant(
  input: Foundation50CoachesEmailInput
): Foundation50EmailVariant {
  const firstName = input.firstName?.trim() || DEFAULT_FIRST_NAME;

  return buildCoachVariant({
    firstName,
    primarySport: input.primarySport,
    organizationName: input.organizationName,
    coachTestimonial: input.coachTestimonial,
  });
}

export function buildFoundation50CoachesPreview(input: Foundation50CoachesEmailInput): {
  readonly subject: string;
  readonly html: string;
  readonly campaignKey: string;
} {
  const variant = buildFoundation50EmailVariant(input);
  return {
    subject: variant.subject,
    html: variant.html,
    campaignKey: variant.campaignKey,
  };
}

export async function sendFoundation50CoachesEmail(
  input: Foundation50CoachesEmailInput
): Promise<{ readonly status: 'sent'; readonly campaignKey: string; readonly email: string }> {
  const email = input.email.trim().toLowerCase();
  const variant = buildFoundation50EmailVariant(input);

  try {
    await sendOutboundMarketingEmail({
      to: email,
      subject: variant.subject,
      html: variant.html,
      campaignKey: variant.campaignKey,
      userId: input.userId,
      replyTo: 'support@nxt1sports.com',
    });

    logger.info('Foundation 50 Coaches email sent', {
      email,
      campaignKey: variant.campaignKey,
      userId: input.userId,
    });

    return {
      status: 'sent',
      campaignKey: variant.campaignKey,
      email,
    };
  } catch (error) {
    logger.error('[MarketingEmail] Foundation 50 Coaches email failed', {
      email,
      userId: input.userId,
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}
