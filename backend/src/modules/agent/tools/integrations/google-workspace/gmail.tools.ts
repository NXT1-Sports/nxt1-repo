/**
 * @fileoverview Gmail First-Class Agent X Tools
 * @module @nxt1/backend/modules/agent/tools/integrations/google-workspace
 *
 * Five explicit Gmail tools matching google-workspace-mcp v1.27.0:
 * query_gmail_emails, gmail_get_message_details, gmail_send_email,
 * create_gmail_draft, gmail_reply_to_email.
 *
 * Additional Gmail tools (gmail_get_attachment_content, delete_gmail_draft,
 * gmail_send_draft, gmail_bulk_delete_messages) are accessible via
 * run_google_workspace_tool.
 */

import type { GoogleWorkspaceMcpSessionService } from './google-workspace-mcp-session.service.js';
import { GoogleWorkspaceBaseTool } from './google-workspace-base.tool.js';
import { createHash, randomUUID } from 'node:crypto';
import type { ToolExecutionContext, ToolResult } from '../../base.tool.js';
import { buildTrackedEmailHtmlWithRecipientHash } from '../../../../../services/communications/connected-mail.service.js';
import { getAnalyticsLoggerService } from '../../../../../services/core/analytics-logger.service.js';
import { z } from 'zod';

const EmptyGmailInputSchema = z.object({}).strict();
const QueryGmailEmailsInputSchema = z.object({
  query: z.string().trim().min(1),
  max_results: z.coerce.number().int().optional(),
});
const GmailGetMessageDetailsInputSchema = z.object({
  email_id: z.string().trim().min(1),
});
const GmailSendEmailInputSchema = z.object({
  to: z.array(z.string().trim().min(1)).min(1),
  subject: z.string().trim().min(1),
  body: z.string().trim().min(1),
  cc: z.array(z.string().trim().min(1)).optional(),
  bcc: z.array(z.string().trim().min(1)).optional(),
});
const CreateGmailDraftInputSchema = z.object({
  to: z.string().trim().min(1),
  subject: z.string().trim().min(1),
  body: z.string().trim().min(1),
  cc: z.string().trim().min(1).optional(),
  bcc: z.string().trim().min(1).optional(),
});
const GmailReplyToEmailInputSchema = z.object({
  email_id: z.string().trim().min(1),
  reply_body: z.string().trim().min(1),
  send: z.boolean().optional(),
  reply_all: z.boolean().optional(),
});

function hashTrackingRecipients(emails: readonly string[]): string | null {
  const normalized = emails
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean)
    .sort();
  if (normalized.length === 0) return null;
  return createHash('sha256').update(normalized.join(',')).digest('hex');
}

// ─── query_gmail_emails ─────────────────────────────────────────────────────

export class QueryGmailEmailsTool extends GoogleWorkspaceBaseTool {
  readonly name = 'query_gmail_emails';
  readonly mcpToolName = 'query_gmail_emails' as const;
  readonly description =
    "Search the user's Gmail inbox using standard Gmail search operators. " +
    'Returns message IDs and metadata for each match. ' +
    'Supports operators like from:, to:, subject:, has:attachment, after:, before:, is:unread, label:, etc.';
  readonly isMutation = false;
  readonly category = 'communication' as const;

  readonly parameters = QueryGmailEmailsInputSchema;

  constructor(sessionService: GoogleWorkspaceMcpSessionService) {
    super(sessionService);
  }
}

// ─── gmail_get_message_details ──────────────────────────────────────────────

export class GmailGetMessageDetailsTool extends GoogleWorkspaceBaseTool {
  readonly name = 'gmail_get_message_details';
  readonly mcpToolName = 'gmail_get_message_details' as const;
  readonly description =
    'Retrieve the full content of a specific Gmail message by its email ID. ' +
    'Returns subject, sender, recipients, date, and body. ' +
    'Use query_gmail_emails first to find the email ID.';
  readonly isMutation = false;
  readonly category = 'communication' as const;

  readonly parameters = GmailGetMessageDetailsInputSchema;

  constructor(sessionService: GoogleWorkspaceMcpSessionService) {
    super(sessionService);
  }
}

// ─── gmail_send_email ───────────────────────────────────────────────────────

export class GmailSendEmailTool extends GoogleWorkspaceBaseTool {
  readonly name = 'gmail_send_email';
  readonly mcpToolName = 'gmail_send_email' as const;
  readonly description =
    "Compose and send an email directly through the user's connected Gmail account. " +
    'Supports multiple recipients, CC, and BCC. For recruiting campaigns or personalized outreach to many recipients, prefer batch_send_email.';
  readonly isMutation = true;
  readonly category = 'communication' as const;

  readonly parameters = GmailSendEmailInputSchema;

  constructor(sessionService: GoogleWorkspaceMcpSessionService) {
    super(sessionService);
  }

  override async execute(
    input: Record<string, unknown>,
    context?: ToolExecutionContext
  ): Promise<ToolResult> {
    if (!context?.userId) {
      return { success: false, error: 'Authenticated user context is required.' };
    }

    const parsed = GmailSendEmailInputSchema.safeParse(input);
    if (!parsed.success) {
      return {
        success: false,
        error: parsed.error.issues.map((issue) => issue.message).join(', '),
      };
    }

    const recipientEmailHash = hashTrackingRecipients([
      ...parsed.data.to,
      ...(parsed.data.cc ?? []),
      ...(parsed.data.bcc ?? []),
    ]);

    const trackedBody = buildTrackedEmailHtmlWithRecipientHash(parsed.data.body, {
      userId: context.userId,
      trackingId: randomUUID(),
      recipientEmailHash,
    });

    const result = await super.execute(
      {
        ...parsed.data,
        body: trackedBody,
      },
      context
    );

    if (result.success) {
      void getAnalyticsLoggerService().safeTrack({
        subjectId: context.userId,
        subjectType: 'user',
        domain: 'communication',
        eventType: 'email_sent',
        source: 'agent',
        actorUserId: context.userId,
        sessionId: context.sessionId ?? null,
        threadId: context.threadId ?? null,
        tags: ['gmail', 'google-workspace-mcp', 'gmail_send_email'],
        payload: {
          provider: 'gmail',
          toCount: parsed.data.to.length,
          ccCount: parsed.data.cc?.length ?? 0,
          bccCount: parsed.data.bcc?.length ?? 0,
          subjectLength: parsed.data.subject.length,
        },
        metadata: {
          toolName: this.name,
          mcpToolName: this.mcpToolName,
          recipientEmailHash,
        },
      });
    }

    return result;
  }
}

// ─── create_gmail_draft ─────────────────────────────────────────────────────

export class CreateGmailDraftTool extends GoogleWorkspaceBaseTool {
  readonly name = 'create_gmail_draft';
  readonly mcpToolName = 'create_gmail_draft' as const;
  readonly description =
    'Create a draft email in Gmail. The draft is saved but NOT sent. ' +
    'Use gmail_send_draft to send it later.';
  readonly isMutation = true;
  readonly category = 'communication' as const;

  readonly parameters = CreateGmailDraftInputSchema;

  constructor(sessionService: GoogleWorkspaceMcpSessionService) {
    super(sessionService);
  }

  override async execute(
    input: Record<string, unknown>,
    context?: ToolExecutionContext
  ): Promise<ToolResult> {
    if (!context?.userId) {
      return { success: false, error: 'Authenticated user context is required.' };
    }

    const parsed = CreateGmailDraftInputSchema.safeParse(input);
    if (!parsed.success) {
      return {
        success: false,
        error: parsed.error.issues.map((issue) => issue.message).join(', '),
      };
    }

    const recipientEmailHash = hashTrackingRecipients([
      parsed.data.to,
      ...(parsed.data.cc ? [parsed.data.cc] : []),
      ...(parsed.data.bcc ? [parsed.data.bcc] : []),
    ]);

    const trackedBody = buildTrackedEmailHtmlWithRecipientHash(parsed.data.body, {
      userId: context.userId,
      trackingId: randomUUID(),
      recipientEmailHash,
    });

    return super.execute(
      {
        ...parsed.data,
        body: trackedBody,
      },
      context
    );
  }
}

// ─── gmail_reply_to_email ───────────────────────────────────────────────────

export class GmailReplyToEmailTool extends GoogleWorkspaceBaseTool {
  readonly name = 'gmail_reply_to_email';
  readonly mcpToolName = 'gmail_reply_to_email' as const;
  readonly description =
    'Reply to an existing Gmail email. Can be sent immediately or saved as a draft. ' +
    'Supports reply-all.';
  readonly isMutation = true;
  readonly category = 'communication' as const;

  readonly parameters = GmailReplyToEmailInputSchema;

  constructor(sessionService: GoogleWorkspaceMcpSessionService) {
    super(sessionService);
  }

  override async execute(
    input: Record<string, unknown>,
    context?: ToolExecutionContext
  ): Promise<ToolResult> {
    if (!context?.userId) {
      return { success: false, error: 'Authenticated user context is required.' };
    }

    const parsed = GmailReplyToEmailInputSchema.safeParse(input);
    if (!parsed.success) {
      return {
        success: false,
        error: parsed.error.issues.map((issue) => issue.message).join(', '),
      };
    }

    const trackedReplyBody = buildTrackedEmailHtmlWithRecipientHash(parsed.data.reply_body, {
      userId: context.userId,
      trackingId: randomUUID(),
      recipientEmailHash: null,
    });

    return super.execute(
      {
        ...parsed.data,
        reply_body: trackedReplyBody,
      },
      context
    );
  }
}

// ─── Backwards-compat aliases ───────────────────────────────────────────────

/** @deprecated Use QueryGmailEmailsTool */
export const SearchGmailMessagesTool = QueryGmailEmailsTool;
/** @deprecated Use GmailGetMessageDetailsTool */
export const GetGmailMessageContentTool = GmailGetMessageDetailsTool;
/** @deprecated Use GmailSendEmailTool */
export const SendGmailMessageTool = GmailSendEmailTool;

function makeRemovedGmailTool(
  oldName: string,
  replacement: string
): new (s: GoogleWorkspaceMcpSessionService) => GoogleWorkspaceBaseTool {
  return class extends GoogleWorkspaceBaseTool {
    readonly name = oldName;
    readonly mcpToolName = 'query_gmail_emails' as const;
    readonly description = `[REMOVED] ${oldName} use ${replacement} instead.`;
    readonly isMutation = false;
    readonly category = 'communication' as const;
    readonly parameters = EmptyGmailInputSchema;

    override async execute(): Promise<{ success: false; error: string }> {
      return {
        success: false,
        error: `"${oldName}" has been removed. Use "${replacement}" instead.`,
      };
    }
  };
}

export const GetGmailMessagesContentBatchTool = makeRemovedGmailTool(
  'get_gmail_messages_content_batch',
  'gmail_get_message_details'
);
export const GetGmailThreadContentTool = makeRemovedGmailTool(
  'get_gmail_thread_content',
  'query_gmail_emails'
);
