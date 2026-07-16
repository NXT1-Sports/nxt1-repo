import type { Firestore } from 'firebase-admin/firestore';
import { syncAllUserEmails } from '../../communications/connected-mail.service.js';

const DEFAULT_SUPPORT_EMAIL = 'support@nxt1sports.com';
const DEFAULT_PLATFORM_FROM_EMAIL = 'nxt1@nxt1sports.com';

export interface MarketingReplyMailboxSyncResult {
  readonly status: 'synced' | 'skipped';
  readonly reason?: 'missing-mailbox-user';
  readonly mailboxUserId?: string;
  readonly mailboxEmail?: string;
  readonly results?: Record<string, { synced: number; skipped: number; errors: number }>;
}

function normalizeEmail(value: string | null | undefined): string | null {
  const normalized = value?.trim().toLowerCase();
  return normalized && normalized.includes('@') ? normalized : null;
}

export function resolveMarketingReplyMailboxEmail(): string {
  const configuredMailboxes = [
    process.env['MARKETING_REPLY_MAILBOXES'],
    process.env['PLATFORM_FROM_EMAIL'],
    process.env['SUPPORT_EMAIL'],
  ]
    .flatMap((value) => (typeof value === 'string' ? value.split(',') : []))
    .map((value) => normalizeEmail(value))
    .filter((value): value is string => value !== null);

  return (
    configuredMailboxes[0] ?? normalizeEmail(DEFAULT_PLATFORM_FROM_EMAIL) ?? DEFAULT_SUPPORT_EMAIL
  );
}

export async function syncMarketingReplyMailbox(input: {
  readonly db: Firestore;
}): Promise<MarketingReplyMailboxSyncResult> {
  const mailboxEmail = resolveMarketingReplyMailboxEmail();
  const snapshot = await input.db
    .collection('Users')
    .where('email', '==', mailboxEmail)
    .limit(1)
    .get();

  if (snapshot.empty) {
    return {
      status: 'skipped',
      reason: 'missing-mailbox-user',
      mailboxEmail,
    };
  }

  const mailboxUserId = snapshot.docs[0]?.id;
  if (!mailboxUserId) {
    return {
      status: 'skipped',
      reason: 'missing-mailbox-user',
      mailboxEmail,
    };
  }

  const results = await syncAllUserEmails(mailboxUserId, input.db);
  return {
    status: 'synced',
    mailboxUserId,
    mailboxEmail,
    results,
  };
}
