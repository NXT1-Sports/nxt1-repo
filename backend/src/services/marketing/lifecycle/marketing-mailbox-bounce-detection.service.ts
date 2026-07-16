import { getRuntimeEnvironment } from '../../../config/runtime-environment.js';
import {
  MarketingEmailDispatchModel,
  type MarketingEmailDispatchDocument,
} from '../../../models/marketing/marketing-email-dispatch.model.js';
import {
  hashMarketingRecipientEmail,
  markMarketingEmailDispatchBounced,
} from '../email/marketing-email-dispatch.service.js';

const DEFAULT_SUPPORT_EMAIL = 'support@nxt1sports.com';
const DEFAULT_PLATFORM_FROM_EMAIL = 'nxt1@nxt1sports.com';
const TERMINAL_BOUNCE_STATUSES = new Set(['bounced', 'blocked', 'unsubscribed', 'complained']);
const BOUNCE_SUBJECT_PATTERNS = [
  /delivery status notification/i,
  /delivery[\s-]+failure/i,
  /mail delivery subsystem/i,
  /message blocked/i,
  /returned mail/i,
  /undeliver(?:able|ed)/i,
  /failure notice/i,
];
const BOUNCE_BODY_PATTERNS = [
  /delivery to the following recipient failed/i,
  /address not found/i,
  /message was blocked/i,
  /delivery has failed/i,
  /undeliverable/i,
  /final-recipient:/i,
  /diagnostic-code:/i,
];

interface MarketingMailboxBounceInput {
  readonly mailboxEmail?: string | null;
  readonly senderEmail?: string | null;
  readonly subject?: string | null;
  readonly bodyText?: string | null;
  readonly headers?: Record<string, string> | null;
  readonly receivedAt?: Date;
}

export interface MarketingMailboxBounceResult {
  readonly status: 'processed' | 'skipped';
  readonly reason?:
    | 'missing-mailbox-email'
    | 'missing-sender-email'
    | 'non-marketing-mailbox'
    | 'internal-sender'
    | 'not-bounce'
    | 'no-dispatch-match'
    | 'already-terminal';
  readonly matchedBy?: 'provider_message_id' | 'recipient_fallback';
  readonly dispatchId?: string;
}

function normalizeEmail(value: string | null | undefined): string | null {
  const normalized = value?.trim().toLowerCase();
  return normalized && normalized.includes('@') ? normalized : null;
}

function resolveMarketingReplyMailboxes(): ReadonlySet<string> {
  const configured = [
    process.env['SUPPORT_EMAIL'],
    process.env['PLATFORM_FROM_EMAIL'],
    process.env['MARKETING_REPLY_MAILBOXES'],
  ]
    .flatMap((value) => (typeof value === 'string' ? value.split(',') : []))
    .map((value) => normalizeEmail(value))
    .filter((value): value is string => value !== null);

  return new Set([...configured, DEFAULT_SUPPORT_EMAIL, DEFAULT_PLATFORM_FROM_EMAIL]);
}

function isInternalNxt1Sender(email: string): boolean {
  return email.endsWith('@nxt1sports.com');
}

function readHeader(
  headers: Record<string, string> | null | undefined,
  name: string
): string | null {
  if (!headers) return null;

  const target = name.toLowerCase();
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() === target) {
      const trimmed = value.trim();
      return trimmed.length > 0 ? trimmed : null;
    }
  }

  return null;
}

function extractEmailFromValue(value: string | null | undefined): string | null {
  if (!value) return null;

  const match = value.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  return normalizeEmail(match?.[0] ?? null);
}

function extractFailedRecipient(
  headers: Record<string, string> | null | undefined,
  bodyText: string
): string | null {
  const directHeaderCandidate =
    extractEmailFromValue(readHeader(headers, 'X-Failed-Recipients')) ??
    extractEmailFromValue(readHeader(headers, 'Final-Recipient')) ??
    extractEmailFromValue(readHeader(headers, 'Original-Recipient'));

  if (directHeaderCandidate) {
    return directHeaderCandidate;
  }

  const bodyPatterns = [
    /X-Failed-Recipients:\s*([^\s]+)/i,
    /Final-Recipient:\s*rfc822;\s*([^\s]+)/i,
    /Original-Recipient:\s*rfc822;\s*([^\s]+)/i,
    /The following address(?:es)? failed:\s*<?([^\s>]+@[^\s>]+)>?/i,
  ];

  for (const pattern of bodyPatterns) {
    const match = bodyText.match(pattern);
    const email = normalizeEmail(match?.[1] ?? null);
    if (email) {
      return email;
    }
  }

  return null;
}

function extractMessageIdCandidates(value: string | null | undefined): string[] {
  if (!value) return [];

  const bracketed = [...value.matchAll(/<[^<>\s]+>/g)].map((match) => match[0].trim());
  if (bracketed.length > 0) {
    return [...new Set(bracketed.map((candidate) => candidate.toLowerCase()))];
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? [trimmed.toLowerCase()] : [];
}

function extractOriginalProviderMessageId(
  headers: Record<string, string> | null | undefined,
  bodyText: string
): string | null {
  const headerCandidates = [
    ...extractMessageIdCandidates(readHeader(headers, 'In-Reply-To')),
    ...extractMessageIdCandidates(readHeader(headers, 'References')),
  ];

  if (headerCandidates.length > 0) {
    return headerCandidates[0] ?? null;
  }

  const bodyMatch = bodyText.match(/Message-ID:\s*(<[^<>\s]+>)/i);
  return bodyMatch?.[1]?.trim().toLowerCase() ?? null;
}

function extractBounceReason(
  headers: Record<string, string> | null | undefined,
  bodyText: string,
  subject: string
): string {
  const diagnosticHeader = readHeader(headers, 'Diagnostic-Code');
  if (diagnosticHeader) {
    return diagnosticHeader;
  }

  const diagnosticBodyMatch = bodyText.match(/Diagnostic-Code:\s*([^\n\r]+)/i);
  if (diagnosticBodyMatch?.[1]) {
    return diagnosticBodyMatch[1].trim();
  }

  const statusBodyMatch = bodyText.match(/Status:\s*([^\n\r]+)/i);
  if (statusBodyMatch?.[1]) {
    return statusBodyMatch[1].trim();
  }

  return subject.trim() || 'Mailbox delivery status notification';
}

function isLikelyBounceMessage(
  senderEmail: string,
  subject: string,
  bodyText: string,
  headers: Record<string, string> | null | undefined
): boolean {
  const senderLocalPart = senderEmail.split('@')[0] ?? '';
  const hasBounceSender = /mailer-daemon|postmaster/i.test(senderLocalPart);
  const hasBounceSubject = BOUNCE_SUBJECT_PATTERNS.some((pattern) => pattern.test(subject));
  const hasBounceBody = BOUNCE_BODY_PATTERNS.some((pattern) => pattern.test(bodyText));
  const hasDsnHeaders =
    readHeader(headers, 'X-Failed-Recipients') !== null ||
    readHeader(headers, 'Final-Recipient') !== null ||
    readHeader(headers, 'Original-Recipient') !== null ||
    readHeader(headers, 'Diagnostic-Code') !== null ||
    /auto-generated|auto-replied/i.test(readHeader(headers, 'Auto-Submitted') ?? '');

  return hasDsnHeaders || ((hasBounceSender || hasBounceSubject) && hasBounceBody);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function findDispatchByProviderMessageId(
  providerMessageId: string
): Promise<MarketingEmailDispatchDocument | null> {
  return MarketingEmailDispatchModel.findOne({
    environment: getRuntimeEnvironment(),
    provider: 'platform_smtp',
    providerMessageId: new RegExp(`^${escapeRegExp(providerMessageId)}$`, 'i'),
  })
    .sort({ sentAt: -1, createdAt: -1 })
    .lean<MarketingEmailDispatchDocument | null>();
}

async function findDispatchByRecipientEmail(
  recipientEmail: string
): Promise<MarketingEmailDispatchDocument | null> {
  const matches = await MarketingEmailDispatchModel.find({
    environment: getRuntimeEnvironment(),
    provider: 'platform_smtp',
    recipientEmailHash: hashMarketingRecipientEmail(recipientEmail),
    sendStatus: { $in: ['sent', 'delivered'] },
    sentAt: { $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) },
  })
    .sort({ sentAt: -1, createdAt: -1 })
    .limit(2)
    .lean<MarketingEmailDispatchDocument[]>();

  return matches.length === 1 ? (matches[0] ?? null) : null;
}

export async function processMarketingBounceForInboundMessage(
  input: MarketingMailboxBounceInput
): Promise<MarketingMailboxBounceResult> {
  const mailboxEmail = normalizeEmail(input.mailboxEmail);
  if (!mailboxEmail) {
    return { status: 'skipped', reason: 'missing-mailbox-email' };
  }

  const senderEmail = normalizeEmail(input.senderEmail);
  if (!senderEmail) {
    return { status: 'skipped', reason: 'missing-sender-email' };
  }

  if (!resolveMarketingReplyMailboxes().has(mailboxEmail)) {
    return { status: 'skipped', reason: 'non-marketing-mailbox' };
  }

  if (senderEmail === mailboxEmail || isInternalNxt1Sender(senderEmail)) {
    return { status: 'skipped', reason: 'internal-sender' };
  }

  const subject = input.subject?.trim() ?? '';
  const bodyText = input.bodyText?.trim() ?? '';
  const headers = input.headers ?? null;

  if (!isLikelyBounceMessage(senderEmail, subject, bodyText, headers)) {
    return { status: 'skipped', reason: 'not-bounce' };
  }

  const providerMessageId = extractOriginalProviderMessageId(headers, bodyText);
  const failedRecipient = extractFailedRecipient(headers, bodyText);

  const providerMatchedDispatch = providerMessageId
    ? await findDispatchByProviderMessageId(providerMessageId)
    : null;

  const matchedBy = providerMatchedDispatch
    ? 'provider_message_id'
    : failedRecipient
      ? 'recipient_fallback'
      : undefined;

  const matchedDispatch =
    providerMatchedDispatch ??
    (failedRecipient ? await findDispatchByRecipientEmail(failedRecipient) : null);

  if (!matchedDispatch) {
    return { status: 'skipped', reason: 'no-dispatch-match' };
  }

  if (TERMINAL_BOUNCE_STATUSES.has(matchedDispatch.sendStatus)) {
    return {
      status: 'skipped',
      reason: 'already-terminal',
      matchedBy,
      dispatchId: matchedDispatch.dispatchId,
    };
  }

  await markMarketingEmailDispatchBounced({
    dispatchId: matchedDispatch.dispatchId,
    bouncedAt: input.receivedAt,
    failureReason: extractBounceReason(headers, bodyText, subject),
  });

  return {
    status: 'processed',
    matchedBy,
    dispatchId: matchedDispatch.dispatchId,
  };
}
