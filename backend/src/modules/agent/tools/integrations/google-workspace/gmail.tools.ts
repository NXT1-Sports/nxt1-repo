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

  readonly parameters = {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description:
          'Gmail search query. Supports standard operators: from:, to:, subject:, ' +
          'has:attachment, after:2024/01/01, before:, is:unread, label:, etc. ' +
          'Example: "from:coach@university.edu subject:recruiting after:2025/01/01".',
      },
      max_results: {
        type: 'number',
        description: 'Maximum number of messages to return (default: 10).',
      },
    },
    required: ['query'],
    additionalProperties: false,
  } as const;

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

  readonly parameters = {
    type: 'object',
    properties: {
      email_id: {
        type: 'string',
        description: 'The Gmail email/message ID to retrieve (from query_gmail_emails results).',
      },
    },
    required: ['email_id'],
    additionalProperties: false,
  } as const;

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
    'Supports multiple recipients, CC, and BCC.';
  readonly isMutation = true;
  readonly category = 'communication' as const;

  readonly parameters = {
    type: 'object',
    properties: {
      to: {
        type: 'array',
        items: { type: 'string' },
        description: 'Array of recipient email addresses.',
      },
      subject: {
        type: 'string',
        description: 'Email subject line.',
      },
      body: {
        type: 'string',
        description: 'Email body content.',
      },
      cc: {
        type: 'array',
        items: { type: 'string' },
        description: 'Optional CC email addresses.',
      },
      bcc: {
        type: 'array',
        items: { type: 'string' },
        description: 'Optional BCC email addresses.',
      },
    },
    required: ['to', 'subject', 'body'],
    additionalProperties: false,
  } as const;

  constructor(sessionService: GoogleWorkspaceMcpSessionService) {
    super(sessionService);
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

  readonly parameters = {
    type: 'object',
    properties: {
      to: {
        type: 'string',
        description: 'Recipient email address.',
      },
      subject: {
        type: 'string',
        description: 'Email subject line.',
      },
      body: {
        type: 'string',
        description: 'Email body content.',
      },
      cc: {
        type: 'string',
        description: 'Optional CC email address.',
      },
      bcc: {
        type: 'string',
        description: 'Optional BCC email address.',
      },
    },
    required: ['to', 'subject', 'body'],
    additionalProperties: false,
  } as const;

  constructor(sessionService: GoogleWorkspaceMcpSessionService) {
    super(sessionService);
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

  readonly parameters = {
    type: 'object',
    properties: {
      email_id: {
        type: 'string',
        description: 'The email ID to reply to.',
      },
      reply_body: {
        type: 'string',
        description: 'The reply message body.',
      },
      send: {
        type: 'boolean',
        description:
          'If true, sends the reply immediately. If false, saves as draft. Defaults to true.',
      },
      reply_all: {
        type: 'boolean',
        description: 'If true, reply to all recipients. Defaults to false.',
      },
    },
    required: ['email_id', 'reply_body'],
    additionalProperties: false,
  } as const;

  constructor(sessionService: GoogleWorkspaceMcpSessionService) {
    super(sessionService);
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
    readonly parameters = { type: 'object' as const, properties: {} };

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
