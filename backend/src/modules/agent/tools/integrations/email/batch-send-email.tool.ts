/**
 * @fileoverview Batch Send Email Tool — Multi-Provider Campaign Sending
 * @module @nxt1/backend/modules/agent/tools/integrations
 *
 * Sends a single approved email template to multiple recipients with
 * per-recipient variable replacement.
 */

import { setTimeout as delay } from 'node:timers/promises';
import { BaseTool, type ToolExecutionContext, type ToolResult } from '../../base.tool.js';
import { sendEmailViaProvider } from '../../../../../services/communications/connected-mail.service.js';
import { getAnalyticsLoggerService } from '../../../../../services/core/analytics-logger.service.js';
import { logger } from '../../../../../utils/logger.js';
import type { Firestore } from 'firebase-admin/firestore';
import { db as defaultDb } from '../../../../../utils/firebase.js';
import {
  type BatchEmailRecipient,
  type EmailProvider,
  MAX_BATCH_RECIPIENTS,
  MAX_BODY_LENGTH,
  MAX_SUBJECT_LENGTH,
  getMissingTemplatePlaceholders,
  normalizeTemplateSyntax,
  renderEmailTemplate,
  resolveConnectedEmailProvider,
} from './email-tool.utils.js';
import { z } from 'zod';

const INTER_SEND_DELAY_MS = 750;

const TemplateVariableValueSchema = z.union([z.string(), z.number(), z.boolean()]);

const BatchRecipientObjectSchema = z.object({
  toEmail: z.string().trim().email(),
  variables: z.record(z.string(), TemplateVariableValueSchema).default({}),
});

const BatchRecipientSchema = z.union([z.string().trim().email(), BatchRecipientObjectSchema]);

const BatchSendEmailInputSchema = z.object({
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
  readonly messageId: string | null;
  readonly threadId: string | null;
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
    return {
      toEmail: recipient,
      variables: {},
    };
  }

  return {
    toEmail: recipient.toEmail,
    variables: recipient.variables,
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

function formatMissingVariableError(
  recipient: BatchEmailRecipient,
  missingVariables: readonly string[]
): string {
  return `Recipient ${recipient.toEmail} is missing template variables: ${missingVariables.join(', ')}`;
}

function resolveRenderedMessage(input: {
  recipient: BatchEmailRecipient;
  subjectTemplate: string;
  bodyHtmlTemplate: string;
}):
  | {
      readonly subject: string;
      readonly bodyHtml: string;
    }
  | {
      readonly error: string;
    } {
  const { recipient, subjectTemplate, bodyHtmlTemplate } = input;
  const missingVariables = getMissingTemplatePlaceholders(
    [subjectTemplate, bodyHtmlTemplate],
    recipient.variables
  );

  if (missingVariables.length > 0) {
    return { error: formatMissingVariableError(recipient, missingVariables) };
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

export class BatchSendEmailTool extends BaseTool {
  readonly name = 'batch_send_email';
  readonly description =
    'Sends the same approved email template to multiple recipients with per-recipient placeholder replacement. ' +
    'Use this instead of looping send_email when sending to more than one person. ' +
    "Placeholders like {{firstName}} and {{collegeName}} are filled from each recipient's variables object.";
  readonly parameters = BatchSendEmailInputSchema;
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
    const parsed = BatchSendEmailInputSchema.safeParse(input);
    if (!parsed.success) {
      return this.zodError(parsed.error);
    }

    const { userId, recipients: rawRecipients } = parsed.data;
    // Normalize template syntax: convert any LLM-generated single-brace {key} to {{key}}
    const subjectTemplate = normalizeTemplateSyntax(parsed.data.subjectTemplate);
    const bodyHtmlTemplate = normalizeTemplateSyntax(parsed.data.bodyHtmlTemplate);
    const recipients = rawRecipients.map(normalizeBatchRecipient);
    const duplicateRecipientError = assertUniqueRecipients(recipients);
    if (duplicateRecipientError) {
      return { success: false, error: duplicateRecipientError };
    }

    context?.emitStage?.('fetching_data', {
      icon: 'email',
      userId,
      recipientCount: recipients.length,
      phase: 'resolve_provider',
    });

    let provider: EmailProvider;
    try {
      provider = await resolveConnectedEmailProvider(userId, this.db);
    } catch (lookupErr) {
      logger.error('Failed to look up user email provider for batch email tool', {
        error: lookupErr instanceof Error ? lookupErr.message : String(lookupErr),
        userId,
      });
      return {
        success: false,
        error:
          lookupErr instanceof Error
            ? lookupErr.message
            : 'Failed to look up connected email account.',
      };
    }

    const previewErrors = recipients
      .map((recipient) => resolveRenderedMessage({ recipient, subjectTemplate, bodyHtmlTemplate }))
      .flatMap((result) => ('error' in result ? [result.error] : []));

    if (previewErrors.length > 0) {
      return {
        success: false,
        error: previewErrors.slice(0, 5).join(' | '),
      };
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
            provider,
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
        const result = await sendEmailViaProvider(
          userId,
          provider,
          recipient.toEmail,
          rendered.subject,
          rendered.bodyHtml,
          this.db
        );

        sent.push({
          toEmail: recipient.toEmail,
          subject: rendered.subject,
          messageId: result.externalMessageId ?? null,
          threadId: result.externalThreadId ?? null,
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

        await getAnalyticsLoggerService().safeTrack({
          subjectId: userId,
          subjectType: 'user',
          domain: 'communication',
          eventType: 'email_sent',
          source: 'agent',
          actorUserId: context?.userId ?? userId,
          sessionId: context?.sessionId ?? null,
          threadId: context?.threadId ?? null,
          tags: [provider, 'agent-email', 'batch-email'],
          payload: {
            provider,
            toEmail: recipient.toEmail,
            subject: rendered.subject,
            trackingId: result.trackingId,
            batchIndex: index,
            batchSize: recipients.length,
          },
          metadata: {
            toolName: this.name,
            externalMessageId: result.externalMessageId ?? null,
            externalThreadId: result.externalThreadId ?? null,
            trackingId: result.trackingId,
          },
        });
      } catch (sendErr) {
        const errorMessage = sendErr instanceof Error ? sendErr.message : 'Failed to send email.';
        failures.push({ toEmail: recipient.toEmail, error: errorMessage });
        logger.error('Failed to send recipient inside batch email tool', {
          error: errorMessage,
          userId,
          provider,
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
          subject: rendered.subject,
          phase: 'send_email',
          recipientStatus: 'failed',
          recipientError: errorMessage,
          progress: `${sent.length}/${recipients.length}`,
        });
      }

      if (index < recipients.length - 1) {
        await delay(INTER_SEND_DELAY_MS, undefined, { signal: context?.signal });
      }
    }

    const sentCount = sent.length;
    const failedCount = failures.length;
    const requestedCount = recipients.length;

    if (sentCount === 0) {
      return {
        success: false,
        error: `Failed to send all ${requestedCount} emails. ${failures[0]?.error ?? 'Unknown error.'}`,
        data: {
          provider,
          requestedCount,
          sentCount,
          failedCount,
          sent,
          failures,
        },
      };
    }

    logger.info('Batch email sent via agent tool', {
      userId,
      provider,
      requestedCount,
      sentCount,
      failedCount,
    });

    return {
      success: true,
      data: {
        provider,
        requestedCount,
        sentCount,
        failedCount,
        sent,
        failures,
        message:
          failedCount > 0
            ? `Sent ${sentCount} of ${requestedCount} emails via ${provider}. ${failedCount} failed.`
            : `Successfully sent ${sentCount} emails via ${provider}.`,
      },
    };
  }
}
