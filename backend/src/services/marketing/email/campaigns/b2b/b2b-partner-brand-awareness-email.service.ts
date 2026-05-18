/**
 * @fileoverview B2B Partner Brand Awareness Campaign
 * @module @nxt1/backend/services/marketing/email/campaigns/b2b/b2b-partner-brand-awareness-email
 */

import { sendOutboundMarketingEmail } from '../../outbound-email.service.js';
import { logger } from '../../../../../utils/logger.js';
import { buildMarketingEmailShell } from '../../templates/marketing-email-shell.js';

const CAMPAIGN_KEY = 'b2b_partner_brand_awareness_free_credits';
const SUBJECT = 'Program Partner Invite';

interface B2BPartnerBrandAwarenessEmailInput {
  readonly email: string;
  readonly firstName?: string | null;
  readonly userId?: string;
}

export interface B2BPartnerBrandAwarenessEmailPreview {
  readonly campaignKey: string;
  readonly subject: string;
  readonly html: string;
}

export function buildB2BPartnerBrandAwarenessEmail(
  _input: Pick<B2BPartnerBrandAwarenessEmailInput, 'firstName'> = {}
): B2BPartnerBrandAwarenessEmailPreview {
  const html = buildMarketingEmailShell({
    preheader:
      'NXT1 is giving select programs $20 in free Agent X credits to experience the first true AI Sports Operating System.',
    eyebrow: 'Program Partner Invite',
    title: 'Your Digital Athletic Department',
    subtitle: '$20 in free Agent X credits to experience a new category of sports operations.',
    introHtml: `
      <p style="margin:0 0 16px 0;font-size:20px;line-height:1.5;color:#101722;">Hi Coach,</p>
      <p style="margin:0 0 16px 0;font-size:19px;line-height:1.65;color:#1f2937;">
        I wanted to personally introduce you to the <strong>New NXT1 Sports</strong>. We didn't build just another video playback tool or communication app. We built the industry's first true <strong>AI Sports Operating System</strong>.
      </p>
      <p style="margin:0;font-size:19px;line-height:1.65;color:#1f2937;">
        To prove it, we are giving a small group of programs <span style="background-color:#eaf7c5;color:#1f3b08;padding:2px 8px;border-radius:4px;font-weight:800;">$20 in free Agent X credits</span>. We want your staff to experience what an active, autonomous AI Command Center can actually do for a program before making any commitment.
      </p>
    `,
    sectionsHtml: [
      `
        <h2 style="margin:0 0 10px 0;font-size:30px;line-height:1.2;color:#111827;font-weight:800;">Meet Agent X: Your Operations Hub</h2>
        <p style="margin:0 0 14px 0;font-size:18px;line-height:1.65;color:#1f2937;">
          Most platforms are passive—they just store your data and wait for you to do the work. <strong>NXT1 is active.</strong> Agent X executes the work for you across every major vertical of your program.
        </p>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;">
          <tr><td style="background-color:#f3f7fb;border:1px solid #d8e3ef;border-radius:10px;padding:16px;border-left:4px solid #ccff00;">
            <p style="margin:0 0 6px 0;font-size:18px;line-height:1.5;color:#111827;font-weight:800;">The AI Creative Director</p>
            <p style="margin:0;font-size:17px;line-height:1.6;color:#1f2937;">Generate professional game-day graphics, commitment edits, and social media assets in seconds without needing a full-time design team or expensive software.</p>
          </td></tr>
        </table>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;margin-top:12px;">
          <tr><td style="background-color:#f3f7fb;border:1px solid #d8e3ef;border-radius:10px;padding:16px;border-left:4px solid #ccff00;">
            <p style="margin:0 0 6px 0;font-size:18px;line-height:1.5;color:#111827;font-weight:800;">Film & Data Analysis</p>
            <p style="margin:0;font-size:17px;line-height:1.6;color:#1f2937;">Go beyond playback. Agent X breaks down game film, identifies developmental themes, and drafts coach-ready player feedback and scouting reports automatically.</p>
          </td></tr>
        </table>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;margin-top:12px;">
          <tr><td style="background-color:#f3f7fb;border:1px solid #d8e3ef;border-radius:10px;padding:16px;border-left:4px solid #ccff00;">
            <p style="margin:0 0 6px 0;font-size:18px;line-height:1.5;color:#111827;font-weight:800;">Smart Communications</p>
            <p style="margin:0;font-size:17px;line-height:1.6;color:#1f2937;">Scale your recruiting and program management. Draft personalized athlete outreach, parent updates, and sponsor networking communications tailored to your exact voice.</p>
          </td></tr>
        </table>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;margin-top:12px;">
          <tr><td style="background-color:#f3f7fb;border:1px solid #d8e3ef;border-radius:10px;padding:16px;border-left:4px solid #ccff00;">
            <p style="margin:0 0 6px 0;font-size:18px;line-height:1.5;color:#111827;font-weight:800;">Autonomous Workflows</p>
            <p style="margin:0;font-size:17px;line-height:1.6;color:#1f2937;">Give Agent X instructions in plain language and let it run background tasks—from summarizing weekly schedules to building strategic playbooks—while you focus on coaching.</p>
          </td></tr>
        </table>
      `,
      `
        <h2 style="margin:0 0 10px 0;font-size:30px;line-height:1.2;color:#111827;font-weight:800;">Your $20 Credit Invite</h2>
        <p style="margin:0 0 14px 0;font-size:18px;line-height:1.65;color:#1f2937;">
          The $20 in free credits lets you push the system to its limits. Test the AI Creative Director on a player graphic, let it analyze a film clip, or have it draft your next recruiting wave. 
        </p>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;">
          <tr>
            <td style="background-color:rgba(204,255,0,0.10);border:1px solid rgba(204,255,0,0.28);border-left:4px solid #ccff00;border-radius:8px;padding:16px;">
              <p style="margin:0;font-size:18px;line-height:1.65;color:#111827;"><strong>No sales pitch required.</strong> Log in to explore the platform and activate your $20 credit so you can see Agent X in action.</p>
            </td>
          </tr>
        </table>
      `,
      `
        <h2 style="margin:0 0 10px 0;font-size:30px;line-height:1.2;color:#111827;font-weight:800;">The Future Of Your Program</h2>
        <p style="margin:0 0 14px 0;font-size:18px;line-height:1.65;color:#1f2937;">
          If you want to see how an AI Command Center can completely upgrade how your staff operates, click below to get started. 
        </p>
        <p style="margin:0;font-size:17px;line-height:1.55;color:#1f2937;">
          Welcome to the era of active platforms. Let's get to work.
        </p>
      `,
    ],
    ctaButtons: [
      {
        label: 'Explore NXT1',
        href: 'https://nxt1sports.com/agent-x',
      },
      {
        label: 'Open Agent X',
        href: 'https://nxt1sports.com/agent-x',
        variant: 'secondary',
      },
    ],
    footerHtml: `
      <p style="margin:0;font-size:13px;line-height:1.5;color:#b7c5d5;">© 2026 NXT1 Sports. All rights reserved.</p>
      <p style="margin:8px 0 0 0;font-size:12px;line-height:1.5;color:#8ea0b4;">You are receiving this because your program was identified as a potential NXT1 partner. Reply to this email if you prefer not to receive partner outreach.</p>
    `,
  });

  return {
    campaignKey: CAMPAIGN_KEY,
    subject: SUBJECT,
    html,
  };
}

export async function sendB2BPartnerBrandAwarenessEmail(
  input: B2BPartnerBrandAwarenessEmailInput
): Promise<void> {
  const email = input.email.trim().toLowerCase();
  const { html, subject, campaignKey } = buildB2BPartnerBrandAwarenessEmail({
    firstName: input.firstName,
  });

  try {
    await sendOutboundMarketingEmail({
      to: email,
      subject,
      html,
      campaignKey,
      userId: input.userId,
      replyTo: 'support@nxt1sports.com',
    });
  } catch (err) {
    logger.error('[MarketingEmail] B2B partner brand awareness email failed', {
      userId: input.userId,
      email,
      error: err instanceof Error ? err.message : String(err),
    });
    throw err;
  }
}
