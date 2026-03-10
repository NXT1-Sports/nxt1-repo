/**
 * @fileoverview Send Gmail Tool
 * @module @nxt1/backend/modules/agent/tools/integrations
 */

import { BaseTool, type ToolResult } from '../base.tool.js';

export class SendGmailTool extends BaseTool {
  readonly name = 'send_gmail';
  readonly description =
    'Sends an email to a coach using the users connected Gmail account via OAuth.';
  readonly parameters = {
    type: 'object',
    properties: {
      toEmail: { type: 'string', description: 'The recipient coach email address.' },
      subject: { type: 'string', description: 'The subject line of the email.' },
      bodyHtml: { type: 'string', description: 'The HTML body of the email.' },
    },
    required: ['toEmail', 'subject', 'bodyHtml'],
  } as const;
  override readonly allowedAgents = ['recruiting_coordinator'] as const;
  readonly isMutation = true;
  readonly category = 'communication' as const;

  /** Maximum lengths to prevent abuse. */
  private static readonly MAX_SUBJECT_LENGTH = 500;
  private static readonly MAX_BODY_LENGTH = 50_000;

  /** Basic email format validation. */
  private static readonly EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  async execute(input: Record<string, unknown>): Promise<ToolResult> {
    // ── Input validation ──────────────────────────────────────────────────
    const toEmail = input['toEmail'];
    const subject = input['subject'];
    const bodyHtml = input['bodyHtml'];

    if (typeof toEmail !== 'string' || !SendGmailTool.EMAIL_REGEX.test(toEmail)) {
      return {
        success: false,
        error: 'Invalid or missing "toEmail": must be a valid email address.',
      };
    }
    if (typeof subject !== 'string' || subject.trim().length === 0) {
      return { success: false, error: 'Invalid or missing "subject": must be a non-empty string.' };
    }
    if (subject.length > SendGmailTool.MAX_SUBJECT_LENGTH) {
      return {
        success: false,
        error: `"subject" exceeds maximum length of ${SendGmailTool.MAX_SUBJECT_LENGTH} characters.`,
      };
    }
    if (typeof bodyHtml !== 'string' || bodyHtml.trim().length === 0) {
      return {
        success: false,
        error: 'Invalid or missing "bodyHtml": must be a non-empty string.',
      };
    }
    if (bodyHtml.length > SendGmailTool.MAX_BODY_LENGTH) {
      return {
        success: false,
        error: `"bodyHtml" exceeds maximum length of ${SendGmailTool.MAX_BODY_LENGTH} characters.`,
      };
    }

    // TODO: Connect to existing /controllers/gmail logic:
    // 1. Fetch user's Gmail OAuth tokens from database
    // 2. Refresh token if expired
    // 3. Initialize Google API Client
    // 4. Send Email
    throw new Error('SendGmailTool is not yet connected to the Gmail API. Implementation pending.');
  }
}
