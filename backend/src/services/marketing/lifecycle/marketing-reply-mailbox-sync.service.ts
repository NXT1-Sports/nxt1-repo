import type { Firestore } from 'firebase-admin/firestore';
import { syncAllUserEmails } from '../../communications/connected-mail.service.js';

const DEFAULT_SUPPORT_EMAIL = 'support@nxt1sports.com';

export interface MarketingReplyMailboxSyncResult {
  readonly status: 'synced' | 'skipped';
  readonly reason?: 'missing-support-user';
  readonly supportUserId?: string;
  readonly mailboxEmail?: string;
  readonly results?: Record<string, { synced: number; skipped: number; errors: number }>;
}

function resolveSupportMailboxEmail(): string {
  return (process.env['SUPPORT_EMAIL']?.trim().toLowerCase() || DEFAULT_SUPPORT_EMAIL).trim();
}

export async function syncMarketingReplyMailbox(input: {
  readonly db: Firestore;
}): Promise<MarketingReplyMailboxSyncResult> {
  const mailboxEmail = resolveSupportMailboxEmail();
  const snapshot = await input.db
    .collection('Users')
    .where('email', '==', mailboxEmail)
    .limit(1)
    .get();

  if (snapshot.empty) {
    return {
      status: 'skipped',
      reason: 'missing-support-user',
      mailboxEmail,
    };
  }

  const supportUserId = snapshot.docs[0]?.id;
  if (!supportUserId) {
    return {
      status: 'skipped',
      reason: 'missing-support-user',
      mailboxEmail,
    };
  }

  const results = await syncAllUserEmails(supportUserId, input.db);
  return {
    status: 'synced',
    supportUserId,
    mailboxEmail,
    results,
  };
}
