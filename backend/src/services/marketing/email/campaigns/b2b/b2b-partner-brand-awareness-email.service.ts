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
  'https://www.figma.com/deck/w5PtNO1546vAFIWd6Gy5YF/NXT1-Customer-Deck?node-id=1-117&t=QrqUr4jTo9M8UVyS-1';
const INTRO_SLIDESHOW_CTA_HREF =
  'https://www.figma.com/deck/w5PtNO1546vAFIWd6Gy5YF/NXT1-Partner-Deck?node-id=1-1205&t=qvYzbBNu5RtKq6VY-1';

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
  return formatted ? `Hello ${escapeHtml(formatted)},` : 'Hello,';
}

function getOrganizationLabel(organization?: string | null): string {
  const normalized = organization?.trim();
  return normalized && normalized.length > 0 ? normalized : 'your program';
}

function getSubject(
  sequenceStep: B2BPartnerOutreachSequenceStep,
  organization?: string | null
): string {
  if (sequenceStep === 'follow_up') {
    return `Quick Follow Up For ${getOrganizationLabel(organization)}`;
  }
  if (sequenceStep === 'final_follow_up') {
    return 'Final Note: Last Chance for Foundation 50 + Free $100';
  }
  const label = getOrganizationLabel(organization);
  return `An Invite For ${label}`;
}

function buildPlainFollowUpEmail(input: {
  readonly greeting: string;
  readonly organizationLabel: string;
  readonly primaryCtaHref: string;
  readonly slideshowCtaHref: string;
}): string {
  const { greeting, organizationLabel, primaryCtaHref, slideshowCtaHref } = input;

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
            Quick follow up from NXT1 Sports for ${organizationLabel}.
          </p>
          <p style="margin:0 0 16px 0;font-size:16px;line-height:1.6;">
            NXT1 is the first AI digital coaching staff built for sports teams, saving coaching staffs hours every week on off-field work like film breakdowns, scout reports, player stats, and weekly game planning so your staff stays focused on players and game day.
          </p>
          <p style="margin:0 0 16px 0;font-size:16px;line-height:1.6;">
            Foundation 50 is open now, with free access to our elite platform for a limited time.
          </p>
          <p style="margin:0 0 16px 0;font-size:16px;line-height:1.6;">
            I'd love to personally invite ${organizationLabel} in before spots close so you don't miss out.
          </p>
          <p style="margin:0 0 8px 0;font-size:16px;line-height:1.6;">
            If you're open to it, book a quick time here: <a href="${primaryCtaHref}" style="color:#0f4aa3;">book a time</a>
          </p>
          <p style="margin:0 0 8px 0;font-size:16px;line-height:1.6;">
            Or just reply with a day/time that works for you and I'll coordinate everything.
          </p>
          <p style="margin:0 0 24px 0;font-size:16px;line-height:1.6;">
            You can also review our slide deck here: <a href="${slideshowCtaHref}" style="color:#0f4aa3;">view slideshow</a>
          </p>
          <p style="margin:0;font-size:16px;line-height:1.6;">
            Best regards,<br />
            John K<br />
            NXT1 Sports<br />
            nxt1sports.com
          </p>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

function buildPlainFinalFollowUpEmail(input: {
  readonly greeting: string;
  readonly organizationLabel: string;
  readonly primaryCtaHref: string;
  readonly secondaryCtaHref: string;
  readonly slideshowCtaHref: string;
}): string {
  const { greeting, organizationLabel, primaryCtaHref, secondaryCtaHref, slideshowCtaHref } = input;

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
            Final note for ${organizationLabel} before we close this out.
          </p>
          <p style="margin:0 0 16px 0;font-size:16px;line-height:1.6;">
            NXT1 is an AI staff built for sports teams that saves coaches hours every week by taking recurring prep, admin, and communication work off your plate.
          </p>
          <p style="margin:0 0 16px 0;font-size:16px;line-height:1.6;">
            This is our last note to invite ${organizationLabel} to join Foundation 50 early. If you join in this early window, you also receive a free $100 donated budget from us with no catch.
          </p>
          <p style="margin:0 0 8px 0;font-size:16px;line-height:1.6;">
            Reserve a time here: <a href="${primaryCtaHref}" style="color:#0f4aa3;">book a time</a>
          </p>
          <p style="margin:0 0 8px 0;font-size:16px;line-height:1.6;">
            View our slideshow here: <a href="${slideshowCtaHref}" style="color:#0f4aa3;">view slideshow</a>
          </p>
          <p style="margin:0 0 8px 0;font-size:16px;line-height:1.6;">
            Visit our website: <a href="${secondaryCtaHref}" style="color:#0f4aa3;">nxt1sports.com</a>
          </p>
          <p style="margin:0 0 24px 0;font-size:16px;line-height:1.6;">
            You can also reply directly with a preferred day/time, and we will coordinate the invite.
          </p>
          <p style="margin:0;font-size:16px;line-height:1.6;">
            Best regards,<br />
            John K<br />
            NXT1 Sports<br />
            nxt1sports.com
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
            I hope you're doing well and having a great week.
          </p>
          <p style="margin:0 0 16px 0;font-size:16px;line-height:1.6;">
            I’m reaching out to introduce you to NXT1 Sports.
          </p>
          <p style="margin:0 0 16px 0;font-size:16px;line-height:1.6;">
            We recently launched the first AI digital coaching staff designed to take the massive load of repetitive, off-field work off your plate.
          </p>
          <p style="margin:0 0 16px 0;font-size:16px;line-height:1.6;">
            While your team is out on the field working, this can handle the backend work of breaking down film, pulling player stats, creating scout reports, building game plans, and much more.
          </p>
          <p style="margin:0 0 16px 0;font-size:16px;line-height:1.6;">
            The feedback from coaches across the country has been incredible. Our team actually has over 20 years of coaching experience, so we know exactly what the daily grind looks like.
          </p>
          <p style="margin:0 0 16px 0;font-size:16px;line-height:1.6;">
            This season, we are rolling out a program called the Foundation 50, where we're giving full, free access to a select group of schools. We would love to hold one of those spots for your team to use this year.
          </p>
          <p style="margin:0 0 16px 0;font-size:16px;line-height:1.6;">
            I've attached our <a href="${primaryCtaHref}" style="color:#0f4aa3;">schedule here</a>, where we can do a live demo to show you how it works.
          </p>
          <p style="margin:0 0 16px 0;font-size:16px;line-height:1.6;">
            Or just let me know a time that works for you.
          </p>
          <p style="margin:0 0 24px 0;font-size:16px;line-height:1.6;">
            I've also included our <a href="${slideshowCtaHref}" style="color:#0f4aa3;">slide deck</a> if you want to take a look beforehand.
          </p>
          <p style="margin:0;font-size:16px;line-height:1.6;">
            Best regards,<br />
            John K<br />
            NXT1 Sports<br />
            nxt1sports.com
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
  const organizationLabel = escapeHtml(getOrganizationLabel(input.organization));
  const subject = getSubject(sequenceStep, input.organization);
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
        organizationLabel,
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
        organizationLabel,
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
