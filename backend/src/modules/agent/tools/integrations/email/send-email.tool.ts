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
import { getAnalyticsLoggerService } from '../../../../../services/core/analytics-logger.service.js';
import { logger } from '../../../../../utils/logger.js';
import { z } from 'zod';

type EmailProvider = 'gmail' | 'microsoft';

const MAX_SUBJECT_LENGTH = 500;
const MAX_BODY_LENGTH = 50_000;

const SendEmailInputSchema = z.object({
  userId: z.string().trim().min(1),
  toEmail: z.string().trim().email(),
  subject: z.string().trim().min(1).max(MAX_SUBJECT_LENGTH),
  bodyHtml: z.string().trim().min(1).max(MAX_BODY_LENGTH),
});

export class SendEmailTool extends BaseTool {
  readonly name = 'send_email';
  readonly description =
    "Sends an email via the user's connected email account (Gmail or Microsoft Outlook). " +
    'The provider is auto-detected from the user profile. ' +
    'Use this to send recruiting outreach emails, follow-ups, or any email on behalf of the user.';
  readonly parameters = SendEmailInputSchema;
  override readonly allowedAgents = ['recruiting_coordinator'] as const;
  readonly isMutation = true;
  readonly category = 'communication' as const;

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

    const { userId, toEmail, subject, bodyHtml } = parsed.data;

    // ── Auto-detect provider from user's connected emails ─────────────────
    context?.emitStage?.('fetching_data', {
      icon: 'email',
      userId,
      recipientEmail: toEmail,
      phase: 'resolve_provider',
    });
    let provider: EmailProvider;
    try {
      const userDoc = await this.db.collection('Users').doc(userId).get();
      const userData = userDoc.data();
      const connectedEmails: Array<{ provider: string; isActive: boolean }> =
        userData?.['connectedEmails'] ?? [];

      const active = connectedEmails.find(
        (ce) => ce.isActive && (ce.provider === 'gmail' || ce.provider === 'microsoft')
      );

      if (!active) {
        return {
          success: false,
          error:
            'No connected email account found. The user needs to connect their Gmail or Outlook account in Settings → Email before sending emails.',
        };
      }

      provider = active.provider as EmailProvider;
    } catch (lookupErr) {
      logger.error('Failed to look up user email provider', {
        error: lookupErr instanceof Error ? lookupErr.message : String(lookupErr),
        userId,
      });
      return { success: false, error: 'Failed to look up connected email account.' };
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
        this.db
      );
      logger.info('Email sent via agent tool', {
        userId,
        provider,
        toEmail,
        messageId: result.externalMessageId,
        threadId: result.externalThreadId,
      });

      await getAnalyticsLoggerService().safeTrack({
        subjectId: userId,
        subjectType: 'user',
        domain: 'communication',
        eventType: 'email_sent',
        source: 'agent',
        actorUserId: context?.userId ?? userId,
        sessionId: context?.sessionId ?? null,
        threadId: context?.threadId ?? null,
        tags: [provider, 'recruiting-email'],
        payload: {
          provider,
          toEmail,
          subject,
          trackingId: result.trackingId,
        },
        metadata: {
          toolName: this.name,
          externalMessageId: result.externalMessageId ?? null,
          externalThreadId: result.externalThreadId ?? null,
          trackingId: result.trackingId,
        },
      });

      return {
        success: true,
        data: {
          messageId: result.externalMessageId ?? null,
          threadId: result.externalThreadId ?? null,
          trackingId: result.trackingId,
          provider,
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
