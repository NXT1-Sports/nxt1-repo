/**
 * @fileoverview Investors & Partnerships Outreach Campaign
 * @module @nxt1/backend/services/marketing/email/campaigns/investors/investors-partnerships-email
 */

import { sendOutboundMarketingEmail } from '../../outbound-email.service.js';
import { logger } from '../../../../../utils/logger.js';
import type { OutboundMarketingEmailResult } from '../../outbound-email.service.js';

export type InvestorsPartnershipsSequenceStep = 'initial' | 'follow_up' | 'final_follow_up';
export type InvestorsPartnershipsAudience = 'investor' | 'partner';

const INITIAL_CAMPAIGN_KEY = 'investors_partnerships_outreach_initial';
const FOLLOW_UP_CAMPAIGN_KEY = 'investors_partnerships_outreach_follow_up';
const FINAL_FOLLOW_UP_CAMPAIGN_KEY = 'investors_partnerships_outreach_final_follow_up';

const PRIMARY_CTA_HREF = 'https://calendar.app.google/V2jQNjQzy3QEVhzu9';
const SECONDARY_CTA_HREF = 'https://nxt1sports.com';
const PARTNER_SLIDESHOW_CTA_HREF =
  'https://www.figma.com/deck/8zc0HWvRlAWtRQt0OaxMr4/NXT1-Partner-Deck?node-id=1-366&t=Pso4bYrSVC8SXmPo-1';
const INVESTOR_SLIDESHOW_CTA_HREF =
  'https://www.figma.com/deck/uz7GK1G0mGvs64FptHfLqH/NXT1-Investor-Deck?node-id=1-947&t=DBvPXg8cWY98XqgQ-1';

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

function normalizeHonorific(value: string | null): string {
  if (!value) return 'Mr.';

  const normalized = value.trim().toLowerCase().replaceAll('.', '');
  if (normalized === 'mr' || normalized === 'mister') return 'Mr.';
  if (normalized === 'mrs') return 'Mrs.';
  if (normalized === 'ms' || normalized === 'miss') return 'Ms.';
  if (normalized === 'dr' || normalized === 'doctor') return 'Dr.';
  if (normalized === 'prof' || normalized === 'professor') return 'Prof.';
  if (normalized === 'coach') return 'Coach';
  return 'Mr.';
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
  const lastName = nameTokens[nameTokens.length - 1]?.replace(/^[^A-Za-z]+|[^A-Za-z'-]+$/g, '');
  if (!lastName) return null;

  return `${honorific} ${lastName}`;
}

function getGreeting(firstName?: string | null): string {
  const formatted = formatProfessionalName(firstName);
  return formatted ? `Hello ${escapeHtml(formatted)},` : 'Hello,';
}

function getEntityLabel(organization?: string | null): string {
  const normalized = organization?.trim();
  return normalized && normalized.length > 0 ? normalized : 'your organization';
}

function resolveAudience(input: {
  readonly audience?: InvestorsPartnershipsAudience;
  readonly leadType?: string | null;
}): InvestorsPartnershipsAudience {
  if (input.audience) return input.audience;
  const normalizedLeadType = input.leadType?.trim().toLowerCase();
  if (normalizedLeadType?.includes('investor')) return 'investor';
  return 'partner';
}

function getSubject(
  sequenceStep: InvestorsPartnershipsSequenceStep,
  audience: InvestorsPartnershipsAudience,
  organization?: string | null
): string {
  const entityLabel = getEntityLabel(organization);

  if (sequenceStep === 'follow_up') {
    return audience === 'investor'
      ? 'NXT1 Is Building A Frontier Platform For Sports'
      : `Quick Follow Up For ${entityLabel}`;
  }
  if (sequenceStep === 'final_follow_up') {
    return audience === 'investor' ? 'Last Call To Review NXT1' : `Final Note For ${entityLabel}`;
  }
  return audience === 'investor'
    ? 'A Built National Scale Sports AI Agent Platform Ready For Investment'
    : `A Partnership Opportunity For ${entityLabel}`;
}

function buildPlainFollowUpEmail(input: {
  readonly audience: InvestorsPartnershipsAudience;
  readonly greeting: string;
  readonly entityLabel: string;
  readonly primaryCtaHref: string;
  readonly secondaryCtaHref: string;
  readonly slideshowCtaHref: string;
}): string {
  const { audience, greeting, entityLabel, primaryCtaHref, secondaryCtaHref, slideshowCtaHref } =
    input;

  const followUpCopy =
    audience === 'investor'
      ? {
          opening:
            'Quick follow up for ${entityLabel}. We are seeing strong traction around NXT1 as a frontier platform for sports organizations.',
          middle:
            'What makes this different is that AI Coordinators handle real execution across strategy, performance, video analysis, recruiting, communications, content, and operations instead of becoming another tool teams have to manage.',
          close:
            'We are looking to align with investors who understand where this category is going and can help us scale distribution, strategic relationships, and long-term market position.',
        }
      : {
          opening:
            'Quick follow up for ${entityLabel}. NXT1 is building the first 24/7 digital sports staff for sports organizations that want execution at a different level.',
          middle: '',
          close:
            'You can own frontier positioning, co-sell leverage, and integration advantage while the market is still behind and get ahead of the new era in sports organizations.',
        };

  return `<!doctype html>
<html>
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Follow Up</title>
  </head>
  <body style="margin:0;padding:0;color:#111111;font-family:Arial,Helvetica,sans-serif;">
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="width:100%;border-collapse:collapse;">
      <tr>
        <td style="padding:24px;">
          <p style="margin:0 0 16px 0;font-size:16px;line-height:1.6;">${greeting}</p>
          <p style="margin:0 0 16px 0;font-size:16px;line-height:1.6;">
            ${followUpCopy.opening.replace('${entityLabel}', entityLabel)}
          </p>
          ${
            followUpCopy.middle
              ? `<p style="margin:0 0 16px 0;font-size:16px;line-height:1.6;">
            ${followUpCopy.middle}
          </p>`
              : ''
          }
          <p style="margin:0 0 16px 0;font-size:16px;line-height:1.6;">
            ${followUpCopy.close}
          </p>
          <p style="margin:0 0 16px 0;font-size:16px;line-height:1.6;">
            ${
              audience === 'investor'
                ? `If this is in your lane, I would value 15 minutes to walk through traction, roadmap, and what a strong fit with ${entityLabel} could look like.`
                : `We are specifically interested in ${entityLabel} and what a strong alignment could look like.`
            }
          </p>
          <p style="margin:0 0 8px 0;font-size:16px;line-height:1.6;">
            View our slideshow here: <a href="${slideshowCtaHref}" style="color:#0f4aa3;">view slideshow</a>
          </p>
          <p style="margin:0 0 8px 0;font-size:16px;line-height:1.6;">
            Book time here: <a href="${primaryCtaHref}" style="color:#0f4aa3;">book a call</a>
          </p>
          <p style="margin:0 0 24px 0;font-size:16px;line-height:1.6;">
            Website: <a href="${secondaryCtaHref}" style="color:#0f4aa3;">nxt1sports.com</a>
          </p>
          <p style="margin:0;font-size:16px;line-height:1.6;">
            Best regards,<br />
            John Keller<br />
            Co-founder / CEO<br />
            john@nxt1sports.com<br />
            330-417-3311
          </p>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

function buildPlainFinalFollowUpEmail(input: {
  readonly audience: InvestorsPartnershipsAudience;
  readonly greeting: string;
  readonly entityLabel: string;
  readonly primaryCtaHref: string;
  readonly secondaryCtaHref: string;
  readonly slideshowCtaHref: string;
}): string {
  const { audience, greeting, entityLabel, primaryCtaHref, secondaryCtaHref, slideshowCtaHref } =
    input;

  const finalCopy =
    audience === 'investor'
      ? {
          second:
            'NXT1 is building the shift from staff-limited sports organizations to agent-powered ones.',
          third:
            'If this is in your lane, I would value 15 minutes to walk through traction, roadmap priorities, and how the right investor can help scale distribution, strategic leverage, and long-term category position while the market is still early.',
        }
      : {
          second:
            'NXT1 is not software alone. It is a 24/7 digital sports staff that can reshape how programs operate across coaches, directors, athletes, and the rest of the organization.',
          third:
            'If this is in your lane, I think you would value 15 minutes to see how NXT1 helps carry real operational work in the background and why partners can move early before the rest of the market catches up.',
        };

  return `<!doctype html>
<html>
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Final Follow Up</title>
  </head>
  <body style="margin:0;padding:0;color:#111111;font-family:Arial,Helvetica,sans-serif;">
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="width:100%;border-collapse:collapse;">
      <tr>
        <td style="padding:24px;">
          <p style="margin:0 0 16px 0;font-size:16px;line-height:1.6;">${greeting}</p>
          <p style="margin:0 0 16px 0;font-size:16px;line-height:1.6;">
            One final note for ${entityLabel}.
          </p>
          <p style="margin:0 0 16px 0;font-size:16px;line-height:1.6;">
            ${finalCopy.second}
          </p>
          <p style="margin:0 0 16px 0;font-size:16px;line-height:1.6;">
            ${finalCopy.third}
          </p>
          <p style="margin:0 0 16px 0;font-size:16px;line-height:1.6;">
            ${
              audience === 'investor'
                ? "When you are ready to move early on where sports is going and align with a company positioned to define the category, let's connect."
                : "When you are ready to take your platform to the next level and give your customers a real execution advantage, let's connect."
            }
          </p>
          <p style="margin:0 0 16px 0;font-size:16px;line-height:1.6;">
            We are genuinely interested in ${entityLabel} and would value exploring whether there is a fit.
          </p>
          <p style="margin:0 0 8px 0;font-size:16px;line-height:1.6;">
            View our slideshow here: <a href="${slideshowCtaHref}" style="color:#0f4aa3;">view slideshow</a>
          </p>
          <p style="margin:0 0 8px 0;font-size:16px;line-height:1.6;">
            Schedule here: <a href="${primaryCtaHref}" style="color:#0f4aa3;">book a call</a>
          </p>
          <p style="margin:0 0 24px 0;font-size:16px;line-height:1.6;">
            Website: <a href="${secondaryCtaHref}" style="color:#0f4aa3;">nxt1sports.com</a>
          </p>
          <p style="margin:0;font-size:16px;line-height:1.6;">
            Best regards,<br />
            John Keller<br />
            Co-founder / CEO<br />
            john@nxt1sports.com<br />
            330-417-3311
          </p>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

interface InvestorsPartnershipsEmailInput {
  readonly email: string;
  readonly firstName?: string | null;
  readonly organization?: string | null;
  readonly sequenceStep?: InvestorsPartnershipsSequenceStep;
  readonly audience?: InvestorsPartnershipsAudience;
  readonly leadType?: string | null;
  readonly userId?: string;
  readonly metadata?: Record<string, unknown>;
}

export interface InvestorsPartnershipsEmailPreview {
  readonly campaignKey: string;
  readonly subject: string;
  readonly sequenceStep: InvestorsPartnershipsSequenceStep;
  readonly html: string;
}

export function buildInvestorsPartnershipsEmail(
  input: Pick<
    InvestorsPartnershipsEmailInput,
    'firstName' | 'organization' | 'sequenceStep' | 'audience' | 'leadType'
  > = {}
): InvestorsPartnershipsEmailPreview {
  const sequenceStep = input.sequenceStep ?? 'initial';
  const audience = resolveAudience({
    audience: input.audience,
    leadType: input.leadType,
  });
  const greeting = getGreeting(input.firstName);
  const rawEntityLabel = getEntityLabel(input.organization);
  const entityLabel = escapeHtml(rawEntityLabel);
  const subject = getSubject(sequenceStep, audience, rawEntityLabel);
  const campaignKey =
    sequenceStep === 'follow_up'
      ? FOLLOW_UP_CAMPAIGN_KEY
      : sequenceStep === 'final_follow_up'
        ? FINAL_FOLLOW_UP_CAMPAIGN_KEY
        : INITIAL_CAMPAIGN_KEY;

  const primaryCtaHref = withUtm(PRIMARY_CTA_HREF, {
    campaign: campaignKey,
    content: 'book_call',
    term: sequenceStep,
  });

  const secondaryCtaHref = withUtm(SECONDARY_CTA_HREF, {
    campaign: campaignKey,
    content: 'visit_site',
    term: sequenceStep,
  });

  const slideshowBaseHref =
    audience === 'investor' ? INVESTOR_SLIDESHOW_CTA_HREF : PARTNER_SLIDESHOW_CTA_HREF;

  const slideshowCtaHref = withUtm(slideshowBaseHref, {
    campaign: campaignKey,
    content: 'view_slideshow',
    term: sequenceStep,
  });

  if (sequenceStep === 'follow_up') {
    return {
      campaignKey,
      subject,
      sequenceStep,
      html: buildPlainFollowUpEmail({
        audience,
        greeting,
        entityLabel,
        primaryCtaHref,
        secondaryCtaHref,
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
        audience,
        greeting,
        entityLabel,
        primaryCtaHref,
        secondaryCtaHref,
        slideshowCtaHref,
      }),
    };
  }

  if (sequenceStep === 'initial') {
    return {
      campaignKey,
      subject,
      sequenceStep,
      html: `<!doctype html>
<html>
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Private Invite</title>
  </head>
  <body style="margin:0;padding:0;color:#111111;font-family:Arial,Helvetica,sans-serif;">
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="width:100%;border-collapse:collapse;">
      <tr>
        <td style="padding:24px;">
          <p style="margin:0 0 16px 0;font-size:16px;line-height:1.6;">${greeting}</p>
          <p style="margin:0 0 16px 0;font-size:16px;line-height:1.6;">
            ${
              audience === 'investor'
                ? 'NXT1 is a built 2026 AI Native Agent company building a frontier platform for sports organizations.'
                : `Our already built 2026 AI Native Agent platform is ready to integrate with a company like ${entityLabel} to take your organization to the new frontier.`
            }
          </p>
          <p style="margin:0 0 16px 0;font-size:16px;line-height:1.6;">
            ${
              audience === 'investor'
                ? 'AI Coordinators run real work across strategy, performance, video analysis, recruiting, communications, content, and operations, turning sports organizations from staff-limited into agent-powered.'
                : 'What makes NXT1 frontier is that it turns sports organizations from staff-limited into agent-powered. AI Coordinators run real work across strategy, performance, video analysis, recruiting, communications, content, and operations instead of leaving that burden on overloaded teams.'
            }
          </p>
          <p style="margin:0 0 16px 0;font-size:16px;line-height:1.6;">
            ${
              audience === 'investor'
                ? 'We are looking to align with investors who understand where this category is going and can help us scale distribution, strategic relationships, and long-term market position as NXT1 expands.'
                : 'It gives teams a 24/7 digital sports staff that can make your platform more indispensable, increase product depth, and create a more differentiated experience for programs using it every day.'
            }
          </p>
          <p style="margin:0 0 16px 0;font-size:16px;line-height:1.6;">
            ${
              audience === 'investor'
                ? 'We would value the chance to walk through current traction, the roadmap ahead, and why we believe NXT1 is positioned to define this category in sports.'
                : "We see a real opportunity to pair your platform with NXT1's agent technology through stronger integrations, better workflow outcomes, and a more valuable platform experience your customers can feel immediately. We would value the chance to show what that can look like in practice."
            }
          </p>
          <p style="margin:0 0 8px 0;font-size:16px;line-height:1.6;">
            View our slideshow here: <a href="${slideshowCtaHref}" style="color:#0f4aa3;">view slideshow</a>
          </p>
          <p style="margin:0 0 8px 0;font-size:16px;line-height:1.6;">
            Book time here: <a href="${primaryCtaHref}" style="color:#0f4aa3;">book a call</a>
          </p>
          <p style="margin:0 0 24px 0;font-size:16px;line-height:1.6;">
            Website: <a href="${secondaryCtaHref}" style="color:#0f4aa3;">nxt1sports.com</a>
          </p>
          <p style="margin:0;font-size:16px;line-height:1.6;">
            Best regards,<br />
            John Keller<br />
            Co-founder / CEO<br />
            john@nxt1sports.com<br />
            330-417-3311
          </p>
        </td>
      </tr>
    </table>
  </body>
</html>`,
    };
  }

  const html = ''; // Left for fallback type checking in testing if someone bypasses sequence checking. Should never be reached.
  return {
    campaignKey,
    subject,
    sequenceStep,
    html,
  };
}

export async function sendInvestorsPartnershipsEmail(
  input: InvestorsPartnershipsEmailInput
): Promise<
  OutboundMarketingEmailResult & {
    readonly campaignKey: string;
    readonly subject: string;
    readonly sequenceStep: InvestorsPartnershipsSequenceStep;
  }
> {
  const email = input.email.trim().toLowerCase();
  const { html, subject, campaignKey, sequenceStep } = buildInvestorsPartnershipsEmail({
    firstName: input.firstName,
    organization: input.organization,
    sequenceStep: input.sequenceStep,
    audience: input.audience,
    leadType: input.leadType,
  });

  try {
    const result = await sendOutboundMarketingEmail({
      to: email,
      subject,
      html,
      campaignKey,
      userId: input.userId,
      replyTo: 'support@nxt1sports.com',
      metadata: input.metadata,
    });

    return {
      ...result,
      campaignKey,
      subject,
      sequenceStep,
    };
  } catch (err) {
    logger.error('[MarketingEmail] Investors/Partnerships outreach email failed', {
      userId: input.userId,
      email,
      sequenceStep,
      error: err instanceof Error ? err.message : String(err),
    });
    throw err;
  }
}
