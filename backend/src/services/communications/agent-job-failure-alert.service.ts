import { sendPlatformEmail } from './platform-email.service.js';
import { buildSupportEmailTemplate } from './templates/support-email-template.js';

export interface AgentJobFailureAlertInput {
  readonly operationId: string;
  readonly userId?: string | null;
  readonly origin?: string | null;
  readonly threadId?: string | null;
  readonly intent?: string | null;
  readonly error: string;
  readonly createdAt?: unknown;
  readonly failedAt?: Date;
}

function resolveAlertRecipient(): string {
  return (
    process.env['AGENT_JOB_FAILURE_ALERT_EMAIL']?.trim() ||
    process.env['SUPPORT_EMAIL']?.trim() ||
    'john@nxt1sports.com'
  );
}

function resolveSupportReplyTo(): string {
  return process.env['SUPPORT_EMAIL']?.trim() || 'support@nxt1sports.com';
}

function hasPlatformEmailCredentials(): boolean {
  const user = (process.env['GMAIL_USER'] ?? process.env['SMTP_USER'] ?? '').trim();
  const pass = (process.env['GMAIL_APP_PASSWORD'] ?? process.env['SMTP_PASS'] ?? '').trim();
  return user.length > 0 && pass.length > 0;
}

function formatTimestamp(value: unknown): string | null {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'string') return value;

  if (typeof value === 'object' && value !== null) {
    const maybeTimestamp = value as { toDate?: () => Date; toMillis?: () => number };
    if (typeof maybeTimestamp.toDate === 'function') {
      return maybeTimestamp.toDate().toISOString();
    }
    if (typeof maybeTimestamp.toMillis === 'function') {
      return new Date(maybeTimestamp.toMillis()).toISOString();
    }
  }

  return null;
}

function truncate(value: string, maxLength: number): string {
  if (value.length <= maxLength) return value;
  return `${value.slice(0, maxLength - 3)}...`;
}

export async function sendAgentJobFailureAlert(input: AgentJobFailureAlertInput): Promise<void> {
  if (!hasPlatformEmailCredentials()) {
    throw new Error('Platform email credentials are not configured for AgentJobs failure alerts.');
  }

  const recipient = resolveAlertRecipient();
  const failedAt = (input.failedAt ?? new Date()).toISOString();
  const createdAt = formatTimestamp(input.createdAt);
  const subject = `[Agent X Failure] ${input.operationId}`;

  const bodyLines = [
    'An Agent X background job has failed and needs review.',
    `Operation ID: ${input.operationId}`,
    `User ID: ${input.userId || 'unknown'}`,
    `Origin: ${input.origin || 'unknown'}`,
    `Thread ID: ${input.threadId || 'not linked'}`,
    ...(createdAt ? [`Created at: ${createdAt}`] : []),
    `Failed at: ${failedAt}`,
    `Error: ${truncate(input.error, 800)}`,
    ...(input.intent ? [`Intent: ${truncate(input.intent, 900)}`] : []),
  ];

  const html = buildSupportEmailTemplate({
    title: 'Agent X Job Failed',
    preheader: `Agent X job ${input.operationId} failed and needs review.`,
    greeting: 'Hi team,',
    bodyLines,
    ticketId: `AGENT-${input.operationId.slice(0, 8).toUpperCase()}`,
    footerNote:
      'This internal alert was generated automatically from the AgentJobs failure pipeline.',
  });

  await sendPlatformEmail(recipient, subject, html, resolveSupportReplyTo());
}
