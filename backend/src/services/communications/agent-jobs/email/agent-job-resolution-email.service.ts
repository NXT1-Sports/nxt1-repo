import type { Firestore } from 'firebase-admin/firestore';
import { sendPlatformEmail } from '../../platform-email.service.js';
import { buildSupportEmailTemplate } from './templates/support-email-template.js';

export interface AgentJobResolutionEmailInput {
  readonly db: Firestore;
  readonly userId: string;
  readonly operationId: string;
  readonly rerunOperationId?: string | null;
  readonly intent?: string | null;
  readonly resolvedAt?: Date;
}

export type AgentJobResolutionEmailResult = 'sent' | 'disabled' | 'missing_recipient';

function readString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function resolveSupportReplyTo(): string {
  return process.env['SUPPORT_EMAIL']?.trim() || 'support@nxt1sports.com';
}

function hasPlatformEmailCredentials(): boolean {
  const user = (process.env['GMAIL_USER'] ?? process.env['SMTP_USER'] ?? '').trim();
  const pass = (process.env['GMAIL_APP_PASSWORD'] ?? process.env['SMTP_PASS'] ?? '').trim();
  return user.length > 0 && pass.length > 0;
}

export function isAgentJobResolutionEmailEnabled(): boolean {
  const values = [
    process.env['AGENT_JOB_CUSTOMER_RECOVERY_EMAILS_ENABLED'],
    process.env['AGENT_JOB_RESOLUTION_EMAILS_ENABLED'],
  ];
  return values.some((rawValue) => {
    const value = rawValue?.trim().toLowerCase();
    return value === 'true' || value === '1' || value === 'yes';
  });
}

function resolveFirstName(data: Record<string, unknown>): string | null {
  const firstName = readString(data['firstName']);
  if (firstName) return firstName;

  const displayName = readString(data['displayName']) ?? readString(data['name']);
  return displayName?.split(/\s+/)[0] ?? null;
}

function truncate(value: string, maxLength: number): string {
  if (value.length <= maxLength) return value;
  return `${value.slice(0, maxLength - 3)}...`;
}

export async function sendAgentJobResolutionEmail(
  input: AgentJobResolutionEmailInput
): Promise<AgentJobResolutionEmailResult> {
  if (!isAgentJobResolutionEmailEnabled()) {
    return 'disabled';
  }

  if (!hasPlatformEmailCredentials()) {
    throw new Error(
      'Platform email credentials are not configured for AgentJobs resolution emails.'
    );
  }

  const userDoc = await input.db.collection('Users').doc(input.userId).get();
  const userData = userDoc.data() ?? {};
  const recipient = readString(userData['email']);
  if (!recipient) {
    return 'missing_recipient';
  }

  const firstName = resolveFirstName(userData);
  const resolvedAt = (input.resolvedAt ?? new Date()).toISOString();
  const subject = 'Your Agent X request has been resolved';
  const referenceId = input.operationId.slice(0, 8).toUpperCase();

  const bodyLines = [
    'We reprocessed the Agent X request on your account, and it has completed successfully.',
    'There is no additional charge or credit deduction for this recovery run. If a temporary wallet hold was placed, it has been released automatically.',
    'You can return to NXT1 and continue from the completed result.',
    `Resolved at: ${resolvedAt}`,
    ...(input.intent ? [`Request: ${truncate(input.intent, 240)}`] : []),
    ...(input.rerunOperationId ? [`Recovery reference: ${input.rerunOperationId}`] : []),
  ];

  const html = buildSupportEmailTemplate({
    title: 'Agent X Request Resolved',
    preheader: 'Your Agent X request has been reprocessed successfully.',
    greeting: firstName ? `Hi ${firstName},` : 'Hi there,',
    bodyLines,
    ticketId: `AGENT-${referenceId}`,
    footerNote: 'This message was sent by NXT1 Support. If you have questions, just reply.',
  });

  await sendPlatformEmail(recipient, subject, html, resolveSupportReplyTo());
  return 'sent';
}
