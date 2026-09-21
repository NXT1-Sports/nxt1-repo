/**
 * @fileoverview B2B Partner Brand Awareness Campaign
 * @module @nxt1/backend/services/marketing/email/campaigns/b2b/b2b-partner-brand-awareness-email
 */

import { sendOutboundMarketingEmail } from '../../outbound-email.service.js';
import { recordB2BPartnerContactEvent } from '../../../integrations/notion/signup-dashboard-entry.service.js';
import { logger } from '../../../../../utils/logger.js';
import type { OutboundMarketingEmailResult } from '../../outbound-email.service.js';
import type { B2BPartnerOutreachSequenceStep } from './b2b-partner-brand-awareness-recipients.js';

const INITIAL_CAMPAIGN_KEY = 'b2b_partner_program_invite_initial';
const FOLLOW_UP_CAMPAIGN_KEY = 'b2b_partner_program_invite_follow_up';
const FINAL_FOLLOW_UP_CAMPAIGN_KEY = 'b2b_partner_program_invite_final_follow_up';
const FOLLOW_UP_DELAY_DAYS = 2;
const PRIMARY_CTA_HREF = 'https://calendar.app.google/LdFFYqWnFKKqVFn3A';
const INTRO_PRIMARY_CTA_HREF = 'https://calendar.app.google/LdFFYqWnFKKqVFn3A';
const SECONDARY_CTA_HREF = 'https://nxt1sports.com';
const SLIDESHOW_CTA_HREF =
  'https://www.figma.com/deck/zkLPBJf9mttjgiIQLvyBXw/NXT1-Deck-NEW-Teams--Copy-?node-id=2002-360&t=BM6jcq1ic6nb3n0D-1';
const INTRO_SLIDESHOW_CTA_HREF =
  'https://www.figma.com/deck/zkLPBJf9mttjgiIQLvyBXw/NXT1-Deck-NEW-Teams--Copy-?node-id=2002-360&t=BM6jcq1ic6nb3n0D-1';

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

function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function normalizeHonorific(value: string | null): string | null {
  if (!value) return null;

  const normalized = value.trim().toLowerCase().replaceAll('.', '');
  if (normalized === 'mr' || normalized === 'mister') return 'Mr.';
  if (normalized === 'mrs') return 'Mrs.';
  if (normalized === 'ms' || normalized === 'miss') return 'Ms.';
  if (normalized === 'dr' || normalized === 'doctor') return 'Dr.';
  if (normalized === 'prof' || normalized === 'professor') return 'Prof.';
  if (normalized === 'coach') return 'Coach';
  return null;
}

function formatProfessionalName(firstName?: string | null): string | null {
  const normalized = (firstName ?? '')
    .replace(/\([^)]*\)/g, ' ')
    .replace(/\[[^\]]*\]/g, ' ')
    .trim();
  if (!normalized) return null;

  const beforeComma = normalized.split(',')[0]?.trim() ?? '';
  if (!beforeComma) return null;

  const tokens = beforeComma
    .split(/\s+/)
    .map((token) => token.trim())
    .filter(Boolean);
  if (tokens.length === 0) return null;

  const firstToken = tokens[0]?.toLowerCase().replaceAll('.', '') ?? '';
  const hasHonorific = [
    'mr',
    'mister',
    'mrs',
    'ms',
    'miss',
    'dr',
    'doctor',
    'prof',
    'professor',
    'coach',
  ].includes(firstToken);

  const honorific = normalizeHonorific(hasHonorific ? tokens[0] : null);
  const nameTokens = hasHonorific ? tokens.slice(1) : tokens;
  const cleanedTokens = nameTokens
    .map((token) => token.replace(/^[^A-Za-z]+|[^A-Za-z'-]+$/g, '').trim())
    .filter(Boolean);

  if (cleanedTokens.length === 0) return null;
  if (cleanedTokens.length === 1) return cleanedTokens[0];

  if (honorific) {
    const lastName = cleanedTokens[cleanedTokens.length - 1];
    return lastName ? `${honorific} ${lastName}` : null;
  }

  return cleanedTokens[0];
}

function getGreeting(firstName?: string | null): string {
  const formatted = formatProfessionalName(firstName);
  return formatted ? `Hi ${escapeHtml(formatted)},` : 'Hi,';
}

function getSubject(sequenceStep: B2BPartnerOutreachSequenceStep): string {
  if (sequenceStep === 'follow_up') {
    return 'Circling Back On NXT1 Sports Intelligence';
  }
  if (sequenceStep === 'final_follow_up') {
    return 'NXT1: An AI Digital Staff For Your Program';
  }
  return 'Introducing NXT1 Sports Intelligence';
}

function buildPlainFollowUpEmail(input: {
  readonly greeting: string;
  readonly primaryCtaHref: string;
  readonly slideshowCtaHref: string;
}): string {
  const { greeting, primaryCtaHref, slideshowCtaHref } = input;

  return `<!doctype html>
<html>
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Follow Up</title>
  </head>
  <body style="margin:0;padding:0;font-family:Arial,Helvetica,sans-serif;">
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="width:100%;border-collapse:collapse;">
      <tr>
        <td style="padding:24px;">
          <p style="margin:0 0 16px 0;font-size:16px;line-height:1.6;">${greeting}</p>
          <p style="margin:0 0 16px 0;font-size:16px;line-height:1.6;">
            Circling back on NXT1. We built what will be the future of how sports organizations operate, and I want to get your program on board early as AI becomes the norm across athletics.
          </p>
          <p style="margin:0 0 16px 0;font-size:16px;line-height:1.6;">
            NXT1 is an AI digital staff built with sports-specific and organizational intelligence that actually goes to work, analyzing film, building game plans, creating reports, handling admin, performance, content and much more.
          </p>
          <p style="margin:0 0 16px 0;font-size:16px;line-height:1.6;">
            The goal is simple: get more done in a fraction of the time and give your staff more intelligence behind their decisions.
          </p>
          <p style="margin:0 0 16px 0;font-size:16px;line-height:1.6;">
            We’re giving programs free access right now, and I’d like to get yours set up.
          </p>
          <p style="margin:0 0 8px 0;font-size:16px;line-height:1.6;">
            Give me 30 minutes and I’ll show you how it works for you.
          </p>
          <p style="margin:0 0 8px 0;font-size:16px;line-height:1.6;">
            Set up demo: <a href="${primaryCtaHref}" style="color:#0f4aa3;">Schedule a Demo</a>
          </p>
          <p style="margin:0 0 24px 0;font-size:16px;line-height:1.6;">
            Review our slide deck: <a href="${slideshowCtaHref}" style="color:#0f4aa3;">view slideshow</a>
          </p>
          <p style="margin:0;font-size:16px;line-height:1.6;">
            Thank you<br />
            Coach Keller
          </p>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

function buildPlainFinalFollowUpEmail(input: {
  readonly greeting: string;
  readonly primaryCtaHref: string;
  readonly secondaryCtaHref: string;
  readonly slideshowCtaHref: string;
}): string {
  const { greeting, primaryCtaHref, secondaryCtaHref, slideshowCtaHref } = input;

  return `<!doctype html>
<html>
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Final Follow Up</title>
  </head>
  <body style="margin:0;padding:0;font-family:Arial,Helvetica,sans-serif;">
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="width:100%;border-collapse:collapse;">
      <tr>
        <td style="padding:24px;">
          <p style="margin:0 0 16px 0;font-size:16px;line-height:1.6;">${greeting}</p>
          <p style="margin:0 0 16px 0;font-size:16px;line-height:1.6;">
            If you’re looking for an opportunity to save time and find new ways to help your program win, NXT1 is the answer.
          </p>
          <p style="margin:0 0 16px 0;font-size:16px;line-height:1.6;">
            NXT1 is built specifically around the way athletic programs actually work. Think of it as adding a digital staff that executes real work across your program, in a fraction of the time.
          </p>
          <p style="margin:0 0 16px 0;font-size:16px;line-height:1.6;">
            All sports. ADs, coaches and athletes. Sports-specific and organizational intelligence working together in one platform.
          </p>
          <p style="margin:0 0 8px 0;font-size:16px;line-height:1.6;">
            I’d like to show you what it can do for your program and get you free access to try it yourself.
          </p>
          <p style="margin:0 0 8px 0;font-size:16px;line-height:1.6;">
            A quick 30-minute demo: <a href="${primaryCtaHref}" style="color:#0f4aa3;">Schedule a Demo</a>
          </p>
          <p style="margin:0 0 8px 0;font-size:16px;line-height:1.6;">
            Review our slide deck: <a href="${slideshowCtaHref}" style="color:#0f4aa3;">view slideshow</a>
          </p>
          <p style="margin:0 0 24px 0;font-size:16px;line-height:1.6;">
            Visit our website: <a href="${secondaryCtaHref}" style="color:#0f4aa3;">nxt1sports.com</a>
          </p>
          <p style="margin:0;font-size:16px;line-height:1.6;">
            Coach Keller
          </p>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

function buildPlainInitialEmail(input: {
  readonly greeting: string;
  readonly primaryCtaHref: string;
  readonly slideshowCtaHref: string;
}): string {
  const { greeting, primaryCtaHref, slideshowCtaHref } = input;

  return `<!doctype html>
<html>
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>An Invite For Your Team</title>
  </head>
  <body style="margin:0;padding:0;font-family:Arial,Helvetica,sans-serif;">
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="width:100%;border-collapse:collapse;">
      <tr>
        <td style="padding:24px;">
          <p style="margin:0 0 16px 0;font-size:16px;line-height:1.6;">${greeting}</p>
          <p style="margin:0 0 16px 0;font-size:16px;line-height:1.6;">
            Coach Keller here. I wanted to introduce you to NXT1.
          </p>
          <p style="margin:0 0 16px 0;font-size:16px;line-height:1.6;">
            We built NXT1 to help athletic programs get more done in a fraction of the time, while giving ADs, coaches and athletes more intelligence behind their decisions.
          </p>
          <p style="margin:0 0 16px 0;font-size:16px;line-height:1.6;">
            NXT1 is an AI digital staff built with sports-specific and organizational intelligence for all sports, executing work such as film analysis, game planning, creating reports, recruiting, performance, media/content, admin work and much more.
          </p>
          <p style="margin:0 0 16px 0;font-size:16px;line-height:1.6;">
            Instead of spending hours doing the work yourself or jumping between different tools, NXT1 actually does the work for you.
          </p>
          <p style="margin:0 0 16px 0;font-size:16px;line-height:1.6;">
            We’re giving schools across the country free access to try it, and I’d love to get your program set up.
          </p>
          <p style="margin:0 0 16px 0;font-size:16px;line-height:1.6;">
            Give me 30 minutes and I’ll show you what NXT1 can do for your program.
          </p>
          <p style="margin:0 0 16px 0;font-size:16px;line-height:1.6;">
            Schedule a demo here: <a href="${primaryCtaHref}" style="color:#0f4aa3;">Schedule a Demo</a>
          </p>
          <p style="margin:0 0 16px 0;font-size:16px;line-height:1.6;">
            Review our slide deck: <a href="${slideshowCtaHref}" style="color:#0f4aa3;">view slideshow</a>
          </p>
          <p style="margin:0 0 24px 0;font-size:16px;line-height:1.6;">
            Thank you
          </p>
          <p style="margin:0;font-size:16px;line-height:1.6;">
            Coach Keller
          </p>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

interface B2BPartnerBrandAwarenessEmailInput {
  readonly email: string;
  readonly firstName?: string | null;
  readonly organization?: string | null;
  readonly sequenceStep?: B2BPartnerOutreachSequenceStep;
  readonly userId?: string;
  readonly metadata?: Record<string, unknown>;
}

export interface B2BPartnerBrandAwarenessEmailPreview {
  readonly campaignKey: string;
  readonly subject: string;
  readonly sequenceStep: B2BPartnerOutreachSequenceStep;
  readonly html: string;
}

export function buildB2BPartnerBrandAwarenessEmail(
  input: Pick<
    B2BPartnerBrandAwarenessEmailInput,
    'firstName' | 'organization' | 'sequenceStep'
  > = {}
): B2BPartnerBrandAwarenessEmailPreview {
  const sequenceStep = input.sequenceStep ?? 'initial';
  const greeting = getGreeting(input.firstName);
  const subject = getSubject(sequenceStep);
  const campaignKey =
    sequenceStep === 'follow_up'
      ? FOLLOW_UP_CAMPAIGN_KEY
      : sequenceStep === 'final_follow_up'
        ? FINAL_FOLLOW_UP_CAMPAIGN_KEY
        : INITIAL_CAMPAIGN_KEY;
  const trackingTerm = sequenceStep;
  const primaryCtaHref = withUtm(PRIMARY_CTA_HREF, {
    campaign: campaignKey,
    content: 'book_demo',
    term: trackingTerm,
  });
  const secondaryCtaHref = withUtm(SECONDARY_CTA_HREF, {
    campaign: campaignKey,
    content: 'visit_site',
    term: trackingTerm,
  });
  const slideshowCtaHref = withUtm(SLIDESHOW_CTA_HREF, {
    campaign: campaignKey,
    content: 'view_slideshow',
    term: trackingTerm,
  });
  const introPrimaryCtaHref = withUtm(INTRO_PRIMARY_CTA_HREF, {
    campaign: campaignKey,
    content: 'book_demo',
    term: trackingTerm,
  });
  const introSlideshowCtaHref = withUtm(INTRO_SLIDESHOW_CTA_HREF, {
    campaign: campaignKey,
    content: 'view_slideshow',
    term: trackingTerm,
  });

  if (sequenceStep === 'follow_up') {
    return {
      campaignKey,
      subject,
      sequenceStep,
      html: buildPlainFollowUpEmail({
        greeting,
        primaryCtaHref,
        slideshowCtaHref,
      }),
    };
  }

  if (sequenceStep === 'final_follow_up') {
    return {
      campaignKey,
      subject,
      sequenceStep,
      html: buildPlainFinalFollowUpEmail({
        greeting,
        primaryCtaHref,
        secondaryCtaHref,
        slideshowCtaHref,
      }),
    };
  }

  const html = buildPlainInitialEmail({
    greeting,
    primaryCtaHref: introPrimaryCtaHref,
    slideshowCtaHref: introSlideshowCtaHref,
  });

  return {
    campaignKey,
    subject,
    sequenceStep,
    html,
  };
}

export async function sendB2BPartnerBrandAwarenessEmail(
  input: B2BPartnerBrandAwarenessEmailInput
): Promise<
  OutboundMarketingEmailResult & {
    readonly campaignKey: string;
    readonly subject: string;
    readonly sequenceStep: B2BPartnerOutreachSequenceStep;
  }
> {
  const email = input.email.trim().toLowerCase();
  const { html, subject, campaignKey, sequenceStep } = buildB2BPartnerBrandAwarenessEmail({
    firstName: input.firstName,
    organization: input.organization,
    sequenceStep: input.sequenceStep,
  });

  try {
    const contactedAt = new Date();
    const nextFollowUpAt =
      sequenceStep === 'initial' ? addDays(contactedAt, FOLLOW_UP_DELAY_DAYS) : null;

    const result = await sendOutboundMarketingEmail({
      to: email,
      subject,
      html,
      campaignKey,
      userId: input.userId,
      replyTo: 'support@nxt1sports.com',
      metadata: input.metadata,
    });

    try {
      const contactEvent = await recordB2BPartnerContactEvent({
        environment: 'production',
        email,
        contactedAt,
        nextFollowUpAt,
        promoteStageToContacted: true,
      });

      if (contactEvent.status === 'skipped') {
        logger.info('[MarketingEmail] B2B partner contact event skipped', {
          email,
          sequenceStep,
          reason: contactEvent.reason,
        });
      }
    } catch (notionErr) {
      logger.warn('[MarketingEmail] Failed to record B2B partner contact event in Notion', {
        email,
        sequenceStep,
        error: notionErr instanceof Error ? notionErr.message : String(notionErr),
      });
    }

    return {
      ...result,
      campaignKey,
      subject,
      sequenceStep,
    };
  } catch (err) {
    logger.error('[MarketingEmail] B2B partner brand awareness email failed', {
      userId: input.userId,
      email,
      sequenceStep: input.sequenceStep ?? 'initial',
      error: err instanceof Error ? err.message : String(err),
    });
    throw err;
  }
}
