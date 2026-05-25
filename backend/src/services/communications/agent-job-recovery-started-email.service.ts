import type { Firestore } from 'firebase-admin/firestore';
import { sendPlatformEmail } from './platform-email.service.js';
import { buildSupportEmailTemplate } from './templates/support-email-template.js';

export interface AgentJobRecoveryStartedEmailInput {
  readonly db: Firestore;
  readonly userId: string;
  readonly operationId: string;
  readonly intent?: string | null;
}

export type AgentJobRecoveryStartedEmailResult = 'sent' | 'disabled' | 'missing_recipient';

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

export function isAgentJobCustomerRecoveryEmailEnabled(): boolean {
  const value = process.env['AGENT_JOB_CUSTOMER_RECOVERY_EMAILS_ENABLED']?.trim().toLowerCase();
  return value === 'true' || value === '1' || value === 'yes';
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

export async function sendAgentJobRecoveryStartedEmail(
  input: AgentJobRecoveryStartedEmailInput
): Promise<AgentJobRecoveryStartedEmailResult> {
  if (!isAgentJobCustomerRecoveryEmailEnabled()) {
    return 'disabled';
  }

  if (!hasPlatformEmailCredentials()) {
    throw new Error(
      'Platform email credentials are not configured for AgentJobs recovery-started emails.'
    );
  }

  const userDoc = await input.db.collection('Users').doc(input.userId).get();
  const userData = userDoc.data() ?? {};
  const recipient = readString(userData['email']);
  if (!recipient) {
    return 'missing_recipient';
  }

  const firstName = resolveFirstName(userData);
  const referenceId = input.operationId.slice(0, 8).toUpperCase();
  const bodyLines = [
    'We noticed an Agent X request on your account did not complete correctly.',
    'Our system is automatically reprocessing it now, so you do not need to submit the request again.',
    'No additional credits will be deducted for this recovery. If a temporary wallet hold was placed, it will be released automatically.',
    'We will send another update once the request has been resolved.',
    ...(input.intent ? [`Request: ${truncate(input.intent, 240)}`] : []),
  ];

  const html = buildSupportEmailTemplate({
    title: 'We Are Resolving Your Agent X Request',
    preheader: 'We are automatically reprocessing your Agent X request.',
    greeting: firstName ? `Hi ${firstName},` : 'Hi there,',
    bodyLines,
    ticketId: `AGENT-${referenceId}`,
    footerNote: 'This message was sent by NXT1 Support. If you have questions, just reply.',
  });

  await sendPlatformEmail(
    recipient,
    'We are resolving your Agent X request',
    html,
    resolveSupportReplyTo()
  );
  return 'sent';
}
