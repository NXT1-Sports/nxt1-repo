/**
 * @fileoverview Send Email Tool — Multi-Provider (Gmail + Microsoft Outlook)
 * @module @nxt1/backend/modules/agent/tools/integrations
 *
 * Sends an email through the user's connected email provider (Gmail or Microsoft).
 * Auto-detects the provider by looking up the user's connectedEmails in Firestore.
 * Delegates to the existing `sendEmailViaProvider()` from connected-mail.service.ts.
 */

import { BaseTool, type ToolResult, type ToolExecutionContext } from '../../base.tool.js';
import { sendEmailViaProvider } from '../../../../../services/communications/connected-mail.service.js';
import type { Firestore } from 'firebase-admin/firestore';
import { db as defaultDb } from '../../../../../utils/firebase.js';
import { logger } from '../../../../../utils/logger.js';
import {
  type EmailProvider,
  MAX_BODY_LENGTH,
  MAX_SUBJECT_LENGTH,
  resolveConnectedEmailProvider,
  stripEmailAttachmentAnnotations,
} from './email-tool.utils.js';
import {
  EmailAttachmentReferenceSchema,
  resolveProviderEmailAttachments,
} from './email-attachment-resolver.js';
import { z } from 'zod';

const RECIPIENT_KIND_ENUM = ['coach', 'college', 'person', 'organization', 'unknown'] as const;

const SendEmailInputSchema = z.object({
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
  attachments: z.array(EmailAttachmentReferenceSchema).max(5).optional(),
});

export class SendEmailTool extends BaseTool {
  readonly name = 'send_email';
  readonly description =
    "Sends an email via the user's connected email account (Gmail or Microsoft Outlook). " +
    'The provider is auto-detected from the user profile. ' +
    'Use this for one-off approved messages. Use batch_send_email when sending the same template to multiple recipients.';
  readonly parameters = SendEmailInputSchema;
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
    const parsed = SendEmailInputSchema.safeParse(input);
    if (!parsed.success) {
      return {
        success: false,
        error: parsed.error.issues.map((issue) => issue.message).join(', '),
      };
    }

    const { toEmail, subject } = parsed.data;
    const bodyHtml = stripEmailAttachmentAnnotations(parsed.data.bodyHtml);
    if (!bodyHtml) {
      return {
        success: false,
        error: 'Email body cannot contain only attachment labels. Add message text before sending.',
      };
    }
    const requestedUserId = parsed.data.userId;
    const userId = context?.userId?.trim() || requestedUserId;
    if (context?.userId && requestedUserId !== userId) {
      logger.warn('Rejected send_email with mismatched userId', {
        contextUserId: userId,
        requestedUserId,
      });
      return { success: false, error: 'Email send user does not match the authenticated session.' };
    }

    // ── Auto-detect provider from user's connected emails ─────────────────
    context?.emitStage?.('fetching_data', {
      icon: 'email',
      userId,
      recipientEmail: toEmail,
      phase: 'resolve_provider',
    });
    let provider: EmailProvider;
    try {
      provider = await resolveConnectedEmailProvider(userId, this.db);
    } catch (lookupErr) {
      const errorMessage =
        lookupErr instanceof Error
          ? lookupErr.message
          : 'Failed to look up connected email account.';
      logger.error('Failed to look up user email provider', {
        error: errorMessage,
        userId,
      });
      return {
        success: false,
        error: errorMessage,
        data: { requiresEmailConnection: true },
      };
    }

    let attachments;
    try {
      attachments = await resolveProviderEmailAttachments({
        userId,
        attachments: parsed.data.attachments ?? [],
        environment: context?.environment,
      });
    } catch (attachmentErr) {
      const errorMessage =
        attachmentErr instanceof Error
          ? attachmentErr.message
          : 'Failed to prepare email attachments.';
      logger.error('Failed to prepare send_email attachments', {
        error: errorMessage,
        userId,
        attachmentCount: parsed.data.attachments?.length ?? 0,
      });
      return { success: false, error: errorMessage };
    }

    // ── Send via the unified email service ────────────────────────────────
    context?.emitStage?.('submitting_job', {
      icon: 'email',
      userId,
      recipientEmail: toEmail,
      subject,
      phase: 'send_email',
    });
    try {
      const result = await sendEmailViaProvider(
        userId,
        provider,
        toEmail,
        subject,
        bodyHtml,
        this.db,
        {
          recipientName: parsed.data.recipientName,
          recipientKind: parsed.data.recipientKind,
          recipientOrgName: parsed.data.recipientOrgName,
          attachments,
          auditContext: {
            toolName: this.name,
            approvalId: context?.approvalId,
            operationId: context?.operationId,
            threadId: context?.threadId,
            sessionId: context?.sessionId,
          },
        }
      );
      logger.info('Email sent via agent tool', {
        userId,
        provider,
        toEmail,
        messageId: result.externalMessageId,
        threadId: result.externalThreadId,
      });

      return {
        success: true,
        data: {
          messageId: result.externalMessageId ?? null,
          threadId: result.externalThreadId ?? null,
          trackingId: result.trackingId,
          provider,
          attachmentCount: attachments.length,
          message: `Email successfully sent to ${toEmail} via ${provider}.`,
        },
      };
    } catch (sendErr) {
      logger.error('Failed to send email via agent tool', {
        error: sendErr instanceof Error ? sendErr.message : String(sendErr),
        userId,
        provider,
        toEmail,
      });
      return {
        success: false,
        error: sendErr instanceof Error ? sendErr.message : 'Failed to send email.',
      };
    }
  }
}
