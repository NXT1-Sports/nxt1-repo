/**
 * @fileoverview Batch Send Email Via NXT1 Tool — Platform Email Fallback (Batch)
 * @module @nxt1/backend/modules/agent/tools/integrations
 *
 * Sends a single approved email template to multiple recipients via the NXT1
 * platform address (nxt1@nxt1sports.com) with per-recipient variable replacement.
 * Use when the user has no connected Gmail or Outlook account.
 */

import { setTimeout as delay } from 'node:timers/promises';
import { BaseTool, type ToolExecutionContext, type ToolResult } from '../../base.tool.js';
import {
  resolveUserReplyToEmail,
  sendPlatformEmailOnBehalfOf,
} from '../../../../../services/communications/platform-email.service.js';
import { logger } from '../../../../../utils/logger.js';
import type { Firestore } from 'firebase-admin/firestore';
import { db as defaultDb } from '../../../../../utils/firebase.js';
import {
  type BatchEmailRecipient,
  MAX_BATCH_RECIPIENTS,
  MAX_BODY_LENGTH,
  MAX_SUBJECT_LENGTH,
  getMissingTemplatePlaceholders,
  normalizeTemplateSyntax,
  renderEmailTemplate,
} from './email-tool.utils.js';
import { z } from 'zod';

const INTER_SEND_DELAY_MS = 750;

const TemplateVariableValueSchema = z.union([z.string(), z.number(), z.boolean()]);

const RECIPIENT_KIND_ENUM = ['coach', 'college', 'person', 'organization', 'unknown'] as const;

const BatchRecipientObjectSchema = z.object({
  toEmail: z.string().trim().email(),
  variables: z.record(z.string(), TemplateVariableValueSchema).default({}),
  recipientName: z
    .string()
    .trim()
    .min(1)
    .max(200)
    .optional()
    .describe(
      "Display name of this recipient (e.g. 'Alex Morgan'). " +
        'Used in email engagement notifications.'
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
      "Organization or institution this recipient belongs to (e.g. 'Ohio State'). " +
        'Used in email engagement notifications.'
    ),
});

const BatchRecipientSchema = z.union([z.string().trim().email(), BatchRecipientObjectSchema]);

const BatchSendEmailViaNxt1InputSchema = z.object({
  userId: z.string().trim().min(1),
  recipients: z.array(BatchRecipientSchema).min(1).max(MAX_BATCH_RECIPIENTS),
  subjectTemplate: z.string().trim().min(1).max(MAX_SUBJECT_LENGTH),
  bodyHtmlTemplate: z
    .string()
    .trim()
    .min(1)
    .max(MAX_BODY_LENGTH)
    .describe(
      'The email body template as HTML. ALWAYS use proper HTML structure: ' +
        '<p> tags for each paragraph, <br> for line breaks within a paragraph, ' +
        '<ul>/<li> for bullet lists, <strong> for bold. ' +
        'Use {{variableName}} double-brace placeholders for per-recipient substitution (e.g. {{firstName}}, {{teamName}}). ' +
        'Example: <p>Hi {{firstName}},</p><p>We wanted to reach out to {{collegeName}}...</p><p>Best,<br>Coach Smith</p>'
    ),
});

interface BatchSendSuccess {
  readonly toEmail: string;
  readonly subject: string;
  readonly trackingId: string;
}

interface BatchSendFailure {
  readonly toEmail: string;
  readonly error: string;
}

function normalizeBatchRecipient(
  recipient: z.infer<typeof BatchRecipientSchema>
): BatchEmailRecipient {
  if (typeof recipient === 'string') {
    return { toEmail: recipient, variables: {} };
  }
  return {
    toEmail: recipient.toEmail,
    variables: recipient.variables,
    recipientName: recipient.recipientName,
    recipientKind: recipient.recipientKind,
    recipientOrgName: recipient.recipientOrgName,
  };
}

function normalizeEmailAddress(email: string): string {
  return email.trim().toLowerCase();
}

function assertUniqueRecipients(recipients: readonly BatchEmailRecipient[]): string | null {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const recipient of recipients) {
    const normalized = normalizeEmailAddress(recipient.toEmail);
    if (seen.has(normalized)) {
      duplicates.add(normalized);
      continue;
    }
    seen.add(normalized);
  }
  if (duplicates.size === 0) return null;
  return `Duplicate recipient emails are not allowed: ${[...duplicates].join(', ')}`;
}

function resolveRenderedMessage(input: {
  recipient: BatchEmailRecipient;
  subjectTemplate: string;
  bodyHtmlTemplate: string;
}): { readonly subject: string; readonly bodyHtml: string } | { readonly error: string } {
  const { recipient, subjectTemplate, bodyHtmlTemplate } = input;
  const missingVariables = getMissingTemplatePlaceholders(
    [subjectTemplate, bodyHtmlTemplate],
    recipient.variables
  );

  if (missingVariables.length > 0) {
    return {
      error: `Recipient ${recipient.toEmail} is missing template variables: ${missingVariables.join(', ')}`,
    };
  }

  const subject = renderEmailTemplate(subjectTemplate, recipient.variables);
  const bodyHtml = renderEmailTemplate(bodyHtmlTemplate, recipient.variables);

  if (subject.trim().length === 0) {
    return { error: `Recipient ${recipient.toEmail} resolved to an empty subject.` };
  }
  if (subject.length > MAX_SUBJECT_LENGTH) {
    return {
      error: `Recipient ${recipient.toEmail} resolved to a subject longer than ${MAX_SUBJECT_LENGTH} characters.`,
    };
  }
  if (bodyHtml.trim().length === 0) {
    return { error: `Recipient ${recipient.toEmail} resolved to an empty email body.` };
  }
  if (bodyHtml.length > MAX_BODY_LENGTH) {
    return {
      error: `Recipient ${recipient.toEmail} resolved to a body longer than ${MAX_BODY_LENGTH} characters.`,
    };
  }

  return { subject, bodyHtml };
}

export class BatchSendEmailViaNxt1Tool extends BaseTool {
  readonly name = 'batch_send_email_via_nxt1';
  readonly description =
    'Sends the same approved email template to multiple recipients via the NXT1 platform address ' +
    '(nxt1@nxt1sports.com) with per-recipient placeholder replacement. ' +
    'Use when the user has no connected Gmail or Outlook account, or when they explicitly choose to send via NXT1. ' +
    "Reply-To is set to the user's registered email so recipients can reply directly to them. " +
    'Use batch_send_email instead when the user has a connected Gmail or Outlook account.';
  readonly parameters = BatchSendEmailViaNxt1InputSchema;
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
    const parsed = BatchSendEmailViaNxt1InputSchema.safeParse(input);
    if (!parsed.success) {
      return this.zodError(parsed.error);
    }

    const { userId, recipients: rawRecipients } = parsed.data;
    const subjectTemplate = normalizeTemplateSyntax(parsed.data.subjectTemplate);
    const bodyHtmlTemplate = normalizeTemplateSyntax(parsed.data.bodyHtmlTemplate);
    const recipients = rawRecipients.map(normalizeBatchRecipient);

    const duplicateError = assertUniqueRecipients(recipients);
    if (duplicateError) {
      return { success: false, error: duplicateError };
    }

    // ── Resolve user's reply-to address once ──────────────────────────────
    context?.emitStage?.('fetching_data', {
      icon: 'email',
      userId,
      recipientCount: recipients.length,
      phase: 'resolve_reply_to',
    });

    let replyTo: string;
    try {
      replyTo = (await resolveUserReplyToEmail(userId, this.db)) ?? 'noreply@nxt1sports.com';
    } catch (lookupErr) {
      logger.warn(
        'Failed to resolve user reply-to email for batch NXT1 send, using noreply fallback',
        {
          error: lookupErr instanceof Error ? lookupErr.message : String(lookupErr),
          userId,
        }
      );
      replyTo = 'noreply@nxt1sports.com';
    }

    // ── Pre-validate all templates ────────────────────────────────────────
    const previewErrors = recipients
      .map((recipient) => resolveRenderedMessage({ recipient, subjectTemplate, bodyHtmlTemplate }))
      .flatMap((result) => ('error' in result ? [result.error] : []));

    if (previewErrors.length > 0) {
      return { success: false, error: previewErrors.slice(0, 5).join(' | ') };
    }

    context?.emitStage?.('submitting_job', {
      icon: 'email',
      userId,
      recipientCount: recipients.length,
      phase: 'send_email_batch',
      progress: '0/' + recipients.length,
    });

    const sent: BatchSendSuccess[] = [];
    const failures: BatchSendFailure[] = [];

    for (const [index, recipient] of recipients.entries()) {
      if (context?.signal?.aborted) {
        return {
          success: false,
          error: 'Batch email sending was cancelled before completion.',
          data: {
            provider: 'nxt1',
            requestedCount: recipients.length,
            sentCount: sent.length,
            failedCount: failures.length,
            sent,
            failures,
          },
        };
      }

      const rendered = resolveRenderedMessage({ recipient, subjectTemplate, bodyHtmlTemplate });
      if ('error' in rendered) {
        failures.push({ toEmail: recipient.toEmail, error: rendered.error });
        continue;
      }

      context?.emitStage?.('submitting_job', {
        icon: 'email',
        userId,
        recipientEmail: recipient.toEmail,
        recipientIndex: index + 1,
        recipientCount: recipients.length,
        subject: rendered.subject,
        phase: 'send_email',
        recipientStatus: 'sending',
        progress: `${index + 1}/${recipients.length}`,
      });

      try {
        const result = await sendPlatformEmailOnBehalfOf(
          userId,
          replyTo,
          recipient.toEmail,
          rendered.subject,
          rendered.bodyHtml,
          {
            recipientName: recipient.recipientName,
            recipientKind: recipient.recipientKind,
            recipientOrgName: recipient.recipientOrgName,
          }
        );

        sent.push({
          toEmail: recipient.toEmail,
          subject: rendered.subject,
          trackingId: result.trackingId,
        });

        context?.emitStage?.('submitting_job', {
          icon: 'email',
          userId,
          recipientEmail: recipient.toEmail,
          recipientIndex: index + 1,
          recipientCount: recipients.length,
          subject: rendered.subject,
          phase: 'send_email',
          recipientStatus: 'sent',
          progress: `${sent.length}/${recipients.length}`,
        });
      } catch (sendErr) {
        const errorMessage = sendErr instanceof Error ? sendErr.message : 'Failed to send email.';
        failures.push({ toEmail: recipient.toEmail, error: errorMessage });
        logger.error('Failed to send recipient inside batch NXT1 email tool', {
          error: errorMessage,
          userId,
          toEmail: recipient.toEmail,
          batchIndex: index,
          batchSize: recipients.length,
        });

        context?.emitStage?.('submitting_job', {
          icon: 'email',
          userId,
          recipientEmail: recipient.toEmail,
          recipientIndex: index + 1,
          recipientCount: recipients.length,
          phase: 'send_email',
          recipientStatus: 'failed',
          progress: `${sent.length}/${recipients.length}`,
        });
      }

      if (index < recipients.length - 1) {
        await delay(INTER_SEND_DELAY_MS);
      }
    }

    const allFailed = sent.length === 0 && failures.length > 0;

    return {
      success: !allFailed,
      ...(allFailed ? { error: `All ${failures.length} emails failed to send.` } : {}),
      data: {
        provider: 'nxt1',
        requestedCount: recipients.length,
        sentCount: sent.length,
        failedCount: failures.length,
        sent,
        failures,
        message:
          sent.length === recipients.length
            ? `All ${sent.length} emails sent via NXT1.`
            : `Sent ${sent.length} of ${recipients.length} emails via NXT1. ${failures.length} failed.`,
      },
    };
  }
}
