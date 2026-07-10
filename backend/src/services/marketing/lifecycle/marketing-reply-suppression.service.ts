import type { Firestore } from 'firebase-admin/firestore';
import type { RuntimeEnvironment } from '../../../config/runtime-environment.js';
import { stagingDb } from '../../../utils/firebase-staging.js';
import {
  getActiveFirestoreEnvironment,
  isEnvironmentScopedFirestore,
} from '../../../utils/firestore-environment-context.js';
import { logger } from '../../../utils/logger.js';
import { upsertInvestorsPartnershipLead } from '../integrations/notion/investors-partnerships-entry.service.js';
import { upsertB2BOutboundLead } from '../integrations/notion/signup-dashboard-entry.service.js';

const B2B_LEADS_COLLECTION = 'MarketingB2BOutboundLeads';
const INVESTORS_LEADS_COLLECTION = 'MarketingInvestorsPartnershipOutboundLeads';
const DEFAULT_SUPPORT_EMAIL = 'support@nxt1sports.com';
const DEFAULT_PLATFORM_FROM_EMAIL = 'nxt1@nxt1sports.com';

type B2BPartnerType = 'School/University' | 'Club/Academy' | 'Facility/Complex';
type InvestorsLeadType =
  | 'Investor'
  | 'Strategic Partner'
  | 'School/University'
  | 'Club/Academy'
  | 'Facility/Complex'
  | 'Other';

interface ReplySuppressionInput {
  readonly db: Firestore;
  readonly mailboxEmail?: string | null;
  readonly senderEmail?: string | null;
  readonly repliedAt?: Date;
  readonly subject?: string | null;
  readonly provider?: string | null;
  readonly externalThreadId?: string | null;
}

export interface ReplySuppressionResult {
  readonly status: 'processed' | 'skipped';
  readonly reason?:
    | 'missing-mailbox-email'
    | 'missing-sender-email'
    | 'non-marketing-mailbox'
    | 'internal-sender';
  readonly matchedLeads: number;
  readonly updatedLeads: number;
  readonly notionUpdates: number;
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

function resolveRuntimeEnvironmentForDb(db: Firestore): RuntimeEnvironment {
  if (isEnvironmentScopedFirestore(db)) {
    return getActiveFirestoreEnvironment();
  }

  return db === stagingDb ? 'staging' : 'production';
}

function resolveNotionEnvironment(): RuntimeEnvironment {
  return 'production';
}

function normalizeB2BPartnerType(value: unknown): B2BPartnerType {
  return value === 'Club/Academy' || value === 'Facility/Complex' ? value : 'School/University';
}

function normalizeInvestorsLeadType(value: unknown): InvestorsLeadType {
  if (
    value === 'Investor' ||
    value === 'Strategic Partner' ||
    value === 'School/University' ||
    value === 'Club/Academy' ||
    value === 'Facility/Complex'
  ) {
    return value;
  }

  return 'Other';
}

function buildReplyNote(input: {
  readonly senderEmail: string;
  readonly mailboxEmail: string;
  readonly repliedAtIso: string;
  readonly subject?: string | null;
  readonly provider?: string | null;
  readonly externalThreadId?: string | null;
}): string {
  const contextParts = [
    input.subject ? `Subject: ${input.subject}` : null,
    input.provider ? `Provider: ${input.provider}` : null,
    input.externalThreadId ? `Thread: ${input.externalThreadId}` : null,
  ].filter((value): value is string => typeof value === 'string' && value.length > 0);

  const suffix = contextParts.length > 0 ? ` (${contextParts.join(' | ')})` : '';
  return `Reply detected from ${input.senderEmail} to ${input.mailboxEmail} at ${input.repliedAtIso}${suffix}. Automated outbound follow-ups stopped.`;
}

function isSuccessfulNotionUpsert(result: { readonly status: string }): boolean {
  return result.status === 'created' || result.status === 'existing';
}

async function suppressB2BLeadReplies(input: {
  readonly db: Firestore;
  readonly senderEmail: string;
  readonly repliedAtIso: string;
  readonly note: string;
  readonly environment: RuntimeEnvironment;
}): Promise<{ readonly matched: number; readonly notionUpdates: number }> {
  const snapshot = await input.db
    .collection(B2B_LEADS_COLLECTION)
    .where('email', '==', input.senderEmail)
    .get();

  let notionUpdates = 0;

  for (const doc of snapshot.docs) {
    const data = (doc.data() as Record<string, unknown>) ?? {};
    await doc.ref.set(
      {
        status: 'replied',
        replied: true,
        repliedAt: input.repliedAtIso,
        nextFollowUpAt: null,
        updatedAt: input.repliedAtIso,
        replyDetection: {
          source: 'connected-mail-sync',
          mailboxEmail: (data['replyDetection'] as Record<string, unknown> | undefined)?.[
            'mailboxEmail'
          ],
          senderEmail: input.senderEmail,
        },
      },
      { merge: true }
    );

    try {
      const organization = String(data['organization'] ?? '').trim();
      if (organization) {
        const notionResult = await upsertB2BOutboundLead({
          environment: input.environment,
          organization,
          email: input.senderEmail,
          primaryContact:
            typeof data['primaryContact'] === 'string' ? data['primaryContact'] : null,
          partnerType: normalizeB2BPartnerType(data['partnerType']),
          stage: 'Replied',
          nextAction: 'Lead replied. Automated outbound sequence stopped.',
          notes: input.note,
          sourceUrl: typeof data['sourceUrl'] === 'string' ? data['sourceUrl'] : null,
          timesContacted:
            typeof data['touchCount'] === 'number' && Number.isFinite(data['touchCount'])
              ? data['touchCount']
              : null,
          nextFollowUpAt: null,
        });
        logger.info('[MarketingReplySuppression] Synced B2B replied state to Notion', {
          leadId: doc.id,
          senderEmail: input.senderEmail,
          notionResult,
        });
        if (isSuccessfulNotionUpsert(notionResult)) {
          notionUpdates += 1;
        }
      }
    } catch (error) {
      logger.error('[MarketingReplySuppression] Failed to sync B2B replied state to Notion', {
        leadId: doc.id,
        senderEmail: input.senderEmail,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return { matched: snapshot.size, notionUpdates };
}

async function suppressInvestorsLeadReplies(input: {
  readonly db: Firestore;
  readonly senderEmail: string;
  readonly repliedAtIso: string;
  readonly note: string;
  readonly environment: RuntimeEnvironment;
}): Promise<{ readonly matched: number; readonly notionUpdates: number }> {
  const snapshot = await input.db
    .collection(INVESTORS_LEADS_COLLECTION)
    .where('email', '==', input.senderEmail)
    .get();

  let notionUpdates = 0;

  for (const doc of snapshot.docs) {
    const data = (doc.data() as Record<string, unknown>) ?? {};
    await doc.ref.set(
      {
        status: 'replied',
        replied: true,
        repliedAt: input.repliedAtIso,
        nextFollowUpAt: null,
        updatedAt: input.repliedAtIso,
        replyDetection: {
          source: 'connected-mail-sync',
          mailboxEmail: (data['replyDetection'] as Record<string, unknown> | undefined)?.[
            'mailboxEmail'
          ],
          senderEmail: input.senderEmail,
        },
      },
      { merge: true }
    );

    try {
      const organization = String(data['organization'] ?? '').trim();
      if (organization) {
        const notionResult = await upsertInvestorsPartnershipLead({
          environment: input.environment,
          organization,
          email: input.senderEmail,
          primaryContact:
            typeof data['primaryContact'] === 'string' ? data['primaryContact'] : null,
          type: normalizeInvestorsLeadType(data['leadType']),
          stage: 'Replied',
          nextAction: 'Lead replied. Automated outbound sequence stopped.',
          notes: input.note,
          sourceUrl: typeof data['sourceUrl'] === 'string' ? data['sourceUrl'] : null,
          timesContacted:
            typeof data['touchCount'] === 'number' && Number.isFinite(data['touchCount'])
              ? data['touchCount']
              : null,
          nextFollowUpAt: null,
        });
        logger.info(
          '[MarketingReplySuppression] Synced investors/partnership replied state to Notion',
          {
            leadId: doc.id,
            senderEmail: input.senderEmail,
            notionResult,
          }
        );
        if (isSuccessfulNotionUpsert(notionResult)) {
          notionUpdates += 1;
        }
      }
    } catch (error) {
      logger.error(
        '[MarketingReplySuppression] Failed to sync investors/partnership replied state to Notion',
        {
          leadId: doc.id,
          senderEmail: input.senderEmail,
          error: error instanceof Error ? error.message : String(error),
        }
      );
    }
  }

  return { matched: snapshot.size, notionUpdates };
}

export async function suppressMarketingRepliesForInboundMessage(
  input: ReplySuppressionInput
): Promise<ReplySuppressionResult> {
  const mailboxEmail = normalizeEmail(input.mailboxEmail);
  if (!mailboxEmail) {
    return {
      status: 'skipped',
      reason: 'missing-mailbox-email',
      matchedLeads: 0,
      updatedLeads: 0,
      notionUpdates: 0,
    };
  }

  const senderEmail = normalizeEmail(input.senderEmail);
  if (!senderEmail) {
    return {
      status: 'skipped',
      reason: 'missing-sender-email',
      matchedLeads: 0,
      updatedLeads: 0,
      notionUpdates: 0,
    };
  }

  if (!resolveMarketingReplyMailboxes().has(mailboxEmail)) {
    return {
      status: 'skipped',
      reason: 'non-marketing-mailbox',
      matchedLeads: 0,
      updatedLeads: 0,
      notionUpdates: 0,
    };
  }

  if (senderEmail === mailboxEmail || isInternalNxt1Sender(senderEmail)) {
    return {
      status: 'skipped',
      reason: 'internal-sender',
      matchedLeads: 0,
      updatedLeads: 0,
      notionUpdates: 0,
    };
  }

  const notionEnvironment = resolveNotionEnvironment();
  const repliedAtIso = (input.repliedAt ?? new Date()).toISOString();
  const note = buildReplyNote({
    senderEmail,
    mailboxEmail,
    repliedAtIso,
    subject: input.subject,
    provider: input.provider,
    externalThreadId: input.externalThreadId,
  });
  const environment = resolveRuntimeEnvironmentForDb(input.db);

  const [b2bResult, investorsResult] = await Promise.all([
    suppressB2BLeadReplies({
      db: input.db,
      senderEmail,
      repliedAtIso,
      note,
      environment: notionEnvironment,
    }),
    suppressInvestorsLeadReplies({
      db: input.db,
      senderEmail,
      repliedAtIso,
      note,
      environment: notionEnvironment,
    }),
  ]);

  const matchedLeads = b2bResult.matched + investorsResult.matched;
  const notionUpdates = b2bResult.notionUpdates + investorsResult.notionUpdates;

  if (matchedLeads > 0) {
    logger.info('[MarketingReplySuppression] Suppressed replied outbound leads', {
      senderEmail,
      mailboxEmail,
      matchedLeads,
      notionUpdates,
      environment,
    });
  }

  return {
    status: 'processed',
    matchedLeads,
    updatedLeads: matchedLeads,
    notionUpdates,
  };
}
