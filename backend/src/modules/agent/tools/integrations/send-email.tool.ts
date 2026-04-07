/**
 * @fileoverview Send Email Tool — Multi-Provider (Gmail + Microsoft Outlook)
 * @module @nxt1/backend/modules/agent/tools/integrations
 *
 * Sends an email through the user's connected email provider (Gmail or Microsoft).
 * Auto-detects the provider by looking up the user's connectedEmails in Firestore.
 * Delegates to the existing `sendEmailViaProvider()` from email-sync.service.ts.
 */

import { BaseTool, type ToolResult, type ToolExecutionContext } from '../base.tool.js';
import { sendEmailViaProvider } from '../../../../services/email-sync.service.js';
import type { Firestore } from 'firebase-admin/firestore';
import { db as defaultDb } from '../../../../utils/firebase.js';
import { logger } from '../../../../utils/logger.js';

type EmailProvider = 'gmail' | 'microsoft';

export class SendEmailTool extends BaseTool {
  readonly name = 'send_email';
  readonly description =
    "Sends an email via the user's connected email account (Gmail or Microsoft Outlook). " +
    'The provider is auto-detected from the user profile. ' +
    'Use this to send recruiting outreach emails, follow-ups, or any email on behalf of the user.';
  readonly parameters = {
    type: 'object',
    properties: {
      userId: {
        type: 'string',
        description: 'The authenticated user ID (uid) who owns the connected email account.',
      },
      toEmail: { type: 'string', description: 'The recipient email address.' },
      subject: { type: 'string', description: 'The subject line of the email.' },
      bodyHtml: { type: 'string', description: 'The body content of the email.' },
    },
    required: ['userId', 'toEmail', 'subject', 'bodyHtml'],
  } as const;
  override readonly allowedAgents = ['recruiting_coordinator'] as const;
  readonly isMutation = true;
  readonly category = 'communication' as const;

  private readonly db: Firestore;

  constructor(db?: Firestore) {
    super();
    this.db = db ?? defaultDb;
  }

  /** Maximum lengths to prevent abuse. */
  private static readonly MAX_SUBJECT_LENGTH = 500;
  private static readonly MAX_BODY_LENGTH = 50_000;

  /** Basic email format validation. */
  private static readonly EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  async execute(
    input: Record<string, unknown>,
    context?: ToolExecutionContext
  ): Promise<ToolResult> {
    const userId = input['userId'] as string | undefined;
    const toEmail = input['toEmail'] as string | undefined;
    const subject = input['subject'] as string | undefined;
    const bodyHtml = input['bodyHtml'] as string | undefined;

    // ── Input validation ──────────────────────────────────────────────────
    if (!userId || typeof userId !== 'string') {
      return { success: false, error: 'Missing required field: userId.' };
    }
    if (typeof toEmail !== 'string' || !SendEmailTool.EMAIL_REGEX.test(toEmail)) {
      return {
        success: false,
        error: 'Invalid or missing "toEmail": must be a valid email address.',
      };
    }
    if (typeof subject !== 'string' || subject.trim().length === 0) {
      return { success: false, error: 'Invalid or missing "subject": must be a non-empty string.' };
    }
    if (subject.length > SendEmailTool.MAX_SUBJECT_LENGTH) {
      return {
        success: false,
        error: `"subject" exceeds maximum length of ${SendEmailTool.MAX_SUBJECT_LENGTH} characters.`,
      };
    }
    if (typeof bodyHtml !== 'string' || bodyHtml.trim().length === 0) {
      return {
        success: false,
        error: 'Invalid or missing "bodyHtml": must be a non-empty string.',
      };
    }
    if (bodyHtml.length > SendEmailTool.MAX_BODY_LENGTH) {
      return {
        success: false,
        error: `"bodyHtml" exceeds maximum length of ${SendEmailTool.MAX_BODY_LENGTH} characters.`,
      };
    }

    // ── Auto-detect provider from user's connected emails ─────────────────
    context?.onProgress?.('Connecting to email provider…');
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
    context?.onProgress?.(`Sending email to ${toEmail}…`);
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
      });
      return {
        success: true,
        data: {
          messageId: result.externalMessageId ?? null,
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
