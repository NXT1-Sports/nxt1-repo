/**
 * @fileoverview Send Email Via NXT1 Tool — Platform Email Fallback
 * @module @nxt1/backend/modules/agent/tools/integrations
 *
 * Sends an email on behalf of the user from the NXT1 platform address
 * (nxt1@nxt1sports.com) with Reply-To set to the user's registered email.
 * Use when the user has no connected Gmail or Outlook account, or when they
 * explicitly choose to send via NXT1. Recipients reply directly to the user.
 */

import { BaseTool, type ToolResult, type ToolExecutionContext } from '../../base.tool.js';
import {
  resolveUserReplyToEmail,
  sendPlatformEmailOnBehalfOf,
} from '../../../../../services/communications/platform-email.service.js';
import type { Firestore } from 'firebase-admin/firestore';
import { db as defaultDb } from '../../../../../utils/firebase.js';
import { logger } from '../../../../../utils/logger.js';
import { MAX_BODY_LENGTH, MAX_SUBJECT_LENGTH } from './email-tool.utils.js';
import { z } from 'zod';

const RECIPIENT_KIND_ENUM = ['coach', 'college', 'person', 'organization', 'unknown'] as const;

const SendEmailViaNxt1InputSchema = z.object({
  userId: z.string().trim().min(1),
  toEmail: z.string().trim().email(),
  subject: z.string().trim().min(1).max(MAX_SUBJECT_LENGTH),
  bodyHtml: z
    .string()
    .trim()
    .min(1)
    .max(MAX_BODY_LENGTH)
    .describe(
      'The full email body as HTML. ALWAYS use proper HTML structure: ' +
        '<p> tags for each paragraph (never send raw text without tags), ' +
        '<br> for line breaks within a paragraph, ' +
        '<ul>/<li> for bullet point lists, ' +
        '<strong> for bold emphasis. ' +
        'Example: <p>Hi John,</p><p>Here are the details...</p><ul><li>Point 1</li><li>Point 2</li></ul><p>Best,<br>Coach Smith</p>'
    ),
  recipientName: z
    .string()
    .trim()
    .min(1)
    .max(200)
    .optional()
    .describe(
      "Display name of the recipient if known (e.g. 'Alex Morgan'). " +
        'Include when sending to a named contact. Used in email engagement notifications.'
    ),
  recipientKind: z
    .enum(RECIPIENT_KIND_ENUM)
    .optional()
    .describe('Category of recipient: coach, college, person, organization, or unknown.'),
  recipientOrgName: z
    .string()
    .trim()
    .min(1)
    .max(200)
    .optional()
    .describe(
      "Organization, college, or team the recipient belongs to, if known (e.g. 'Ohio State'). " +
        'Used in email engagement notifications.'
    ),
});

export class SendEmailViaNxt1Tool extends BaseTool {
  readonly name = 'send_email_via_nxt1';
  readonly description =
    'Sends an email on behalf of the user from the NXT1 platform address (nxt1@nxt1sports.com) ' +
    "with Reply-To set to the user's registered email address. " +
    'Use when the user has no connected Gmail or Outlook account, or when they explicitly choose ' +
    'to send via NXT1 instead of their own account. ' +
    'Recipients can reply directly back to the user. ' +
    'Use send_email instead when the user has a connected Gmail or Outlook account.';
  readonly parameters = SendEmailViaNxt1InputSchema;
  override readonly allowedAgents = ['*'] as const;
  readonly isMutation = true;
  readonly category = 'communication' as const;
  readonly entityGroup = 'system_tools' as const;

  private readonly db: Firestore;

  constructor(db?: Firestore) {
    super();
    this.db = db ?? defaultDb;
  }

  async execute(
    input: Record<string, unknown>,
    context?: ToolExecutionContext
  ): Promise<ToolResult> {
    const parsed = SendEmailViaNxt1InputSchema.safeParse(input);
    if (!parsed.success) {
      return {
        success: false,
        error: parsed.error.issues.map((issue) => issue.message).join(', '),
      };
    }

    const { userId, toEmail, subject, bodyHtml } = parsed.data;

    // ── Resolve user's reply-to address ───────────────────────────────────
    context?.emitStage?.('fetching_data', {
      icon: 'email',
      userId,
      recipientEmail: toEmail,
      phase: 'resolve_reply_to',
    });

    let replyTo: string;
    try {
      replyTo = (await resolveUserReplyToEmail(userId, this.db)) ?? 'noreply@nxt1sports.com';
    } catch (lookupErr) {
      logger.warn('Failed to resolve user reply-to email, using noreply fallback', {
        error: lookupErr instanceof Error ? lookupErr.message : String(lookupErr),
        userId,
      });
      replyTo = 'noreply@nxt1sports.com';
    }

    // ── Send via NXT1 platform SMTP ───────────────────────────────────────
    context?.emitStage?.('submitting_job', {
      icon: 'email',
      userId,
      recipientEmail: toEmail,
      subject,
      phase: 'send_email',
    });

    try {
      const result = await sendPlatformEmailOnBehalfOf(
        userId,
        replyTo,
        toEmail,
        subject,
        bodyHtml,
        {
          recipientName: parsed.data.recipientName,
          recipientKind: parsed.data.recipientKind,
          recipientOrgName: parsed.data.recipientOrgName,
        }
      );

      logger.info('Email sent via NXT1 platform on behalf of user', {
        userId,
        toEmail,
        replyTo,
        trackingId: result.trackingId,
      });

      return {
        success: true,
        data: {
          trackingId: result.trackingId,
          provider: 'nxt1',
          message: `Email sent to ${toEmail} via NXT1.`,
        },
      };
    } catch (sendErr) {
      const errorMessage = sendErr instanceof Error ? sendErr.message : 'Failed to send email.';

      if (
        sendErr instanceof Error &&
        sendErr.message.includes('Platform email service is not configured')
      ) {
        return { success: false, error: 'Platform email service is not configured.' };
      }

      logger.error('Failed to send email via NXT1 platform', {
        error: errorMessage,
        userId,
        toEmail,
      });

      return { success: false, error: errorMessage };
    }
  }
}
