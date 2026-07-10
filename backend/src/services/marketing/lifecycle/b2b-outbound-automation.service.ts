/**
 * @fileoverview Automated B2B outbound lifecycle service
 * @module @nxt1/backend/services/marketing/lifecycle/b2b-outbound-automation
 */

import type { RuntimeEnvironment } from '../../../config/runtime-environment.js';
import {
  getNotionSignupDashboardConfig,
  getNotionSignupDashboardDisabledReason,
  type NotionSignupDashboardConfig,
} from '../integrations/notion/notion-client.service.js';
import { syncMarketingReplyMailbox } from './marketing-reply-mailbox-sync.service.js';
import { sendB2BPartnerBrandAwarenessEmail } from '../email/campaigns/b2b/b2b-partner-brand-awareness-email.service.js';
import { sendFoundation50CoachesEmail } from '../email/campaigns/foundation/foundation-50-coaches-email.service.js';
import { upsertB2BOutboundLead } from '../integrations/notion/signup-dashboard-entry.service.js';

const LEADS_COLLECTION = 'MarketingB2BOutboundLeads';
const DAILY_BUDGET_COLLECTION = 'MarketingB2BOutboundDailyBudget';
const DEFAULT_SEND_LIMIT = 250;
const DEFAULT_DAILY_CAP = 250;
const NOTION_SYNC_LIMIT = 1000;
const MAX_PROFESSIONAL_B2B_BATCH = 250;
const FIRST_FOLLOW_UP_DELAY_DAYS = 2;
const SECOND_FOLLOW_UP_DELAY_DAYS = 3;
const MAX_AUTOMATED_TOUCHES = 3;
const MAX_FAILURES_BEFORE_DEAD_LETTER = 3;
const SEND_LOCK_TTL_MS = 15 * 60 * 1000;

type PartnerType = 'School/University' | 'Club/Academy' | 'Facility/Complex';
type LeadStatus =
  | 'lead'
  | 'contacted'
  | 'follow_up_due'
  | 'follow_up_sent'
  | 'phone_call_due'
  | 'converted'
  | 'replied'
  | 'paused'
  | 'dead_letter';

interface OutboundLeadRecord {
  readonly id: string;
  readonly organization: string;
  readonly partnerType: PartnerType;
  readonly domain: string;
  readonly sourceUrl: string;
  readonly primaryContact: string | null;
  readonly email: string | null;
  readonly phone: string | null;
  readonly status: LeadStatus;
  readonly touchCount: number;
  readonly sendCount: number;
  readonly failureCount: number;
  readonly lastError: string | null;
  readonly discoveredAt: string;
  readonly updatedAt: string;
  readonly lastContactedAt: string | null;
  readonly nextFollowUpAt: string | null;
  readonly notionPageId?: string;
  readonly notionPageUrl?: string;
  readonly sendLockUntil: string | null;
  readonly paused: boolean;
  readonly replied: boolean;
}

export interface B2BOutboundSendResult {
  readonly selected: number;
  readonly attempted: number;
  readonly sent: number;
  readonly failed: number;
  readonly skippedNoEmail: number;
  readonly deadLettered: number;
}

interface SendInput {
  readonly db: FirebaseFirestore.Firestore;
  readonly environment: RuntimeEnvironment;
  readonly limit?: number;
  readonly dailyCap?: number;
}

interface NotionRichTextItem {
  readonly plain_text?: string;
  readonly text?: {
    readonly content?: string;
  };
}

interface NotionPageProperty {
  readonly type?: string;
  readonly title?: unknown[];
  readonly rich_text?: unknown[];
  readonly email?: string | null;
  readonly status?: { readonly name?: string | null } | null;
  readonly select?: { readonly name?: string | null } | null;
  readonly date?: { readonly start?: string | null } | null;
  readonly url?: string | null;
  readonly number?: number | null;
}

interface NotionPage {
  readonly id: string;
  readonly properties?: Record<string, NotionPageProperty>;
}

interface NotionQueryResponse {
  readonly results?: readonly NotionPage[];
  readonly has_more?: boolean;
  readonly next_cursor?: string | null;
}

type OutboundSequenceStep = 'initial' | 'follow_up';

function compactText(value: string | null | undefined): string | undefined {
  const normalized = value?.trim();
  return normalized && normalized.length > 0 ? normalized : undefined;
}

function extractPlainText(items: unknown): string {
  if (!Array.isArray(items)) return '';

  return items
    .map((item) => {
      const typed = item as NotionRichTextItem;
      return typed?.plain_text ?? typed?.text?.content ?? '';
    })
    .join('')
    .trim();
}

function resolveCandidatePropertyName(
  properties: Record<string, NotionPageProperty> | undefined,
  candidates: readonly string[],
  expectedType: string
): string | null {
  if (!properties) return null;

  for (const candidate of candidates) {
    const prop = properties[candidate];
    if (prop && (!prop.type || prop.type === expectedType)) {
      return candidate;
    }
  }

  return null;
}

function normalizePartnerType(value: string | undefined): PartnerType {
  const normalized = value?.trim().toLowerCase();
  if (normalized && ['club', 'academy', 'organization'].includes(normalized)) {
    return 'Club/Academy';
  }
  return 'School/University';
}

function toLeadIdFromEmail(email: string): string {
  return email
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function toLeadStatusFromNotionStage(
  stage: string | undefined,
  nextFollowUpAt: string | null,
  touchCount: number
): LeadStatus {
  const normalized = stage?.trim().toLowerCase();
  if (normalized === 'lead') return 'lead';
  if (normalized === 'phone call due') return 'phone_call_due';

  if (normalized === 'contacted') {
    if (nextFollowUpAt) {
      const dueAt = toDate(nextFollowUpAt);
      if (dueAt && dueAt.getTime() <= Date.now()) {
        return 'follow_up_due';
      }
    }
    if (touchCount >= MAX_AUTOMATED_TOUCHES) {
      return 'phone_call_due';
    }
    return 'contacted';
  }

  if (normalized === 'follow-up sent' || normalized === 'follow up sent') {
    return 'follow_up_sent';
  }

  if (
    normalized === 'account started' ||
    normalized === 'signed up' ||
    normalized === 'converted'
  ) {
    return 'converted';
  }

  if (normalized === 'replied') return 'replied';
  if (normalized === 'paused') return 'paused';

  return 'lead';
}

async function queryNotionLeadChunk(input: {
  readonly config: NotionSignupDashboardConfig;
  readonly startCursor: string | null;
}): Promise<NotionQueryResponse> {
  if (!input.config.databaseId) {
    throw new Error('Missing Notion database id.');
  }
  if (!input.config.apiToken) {
    throw new Error('Missing Notion API token.');
  }

  const body = {
    page_size: 100,
    ...(input.startCursor ? { start_cursor: input.startCursor } : {}),
  };

  const response = await fetch(
    `${input.config.apiBaseUrl}/databases/${input.config.databaseId}/query`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${input.config.apiToken}`,
        'Content-Type': 'application/json',
        'Notion-Version': input.config.apiVersion,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(input.config.timeoutMs),
    }
  );

  if (!response.ok) {
    const details = await response.text().catch(() => 'unknown error');
    throw new Error(`Notion query failed (${response.status}): ${details.slice(0, 500)}`);
  }

  return (await response.json()) as NotionQueryResponse;
}

async function syncOutboundQueueFromNotion(input: {
  readonly db: FirebaseFirestore.Firestore;
  readonly environment: RuntimeEnvironment;
  readonly limit: number;
}): Promise<void> {
  const config = getNotionSignupDashboardConfig(input.environment);
  if (getNotionSignupDashboardDisabledReason(config)) {
    return;
  }

  let cursor: string | null = null;
  const maxRows = Math.max(1, input.limit);
  const pages: NotionPage[] = [];

  while (pages.length < maxRows) {
    const response = await queryNotionLeadChunk({
      config,
      startCursor: cursor,
    });

    const chunk = response.results ?? [];
    pages.push(...chunk.slice(0, Math.max(0, maxRows - pages.length)));

    if (!response.has_more || !response.next_cursor) {
      break;
    }

    cursor = response.next_cursor;
  }

  for (const page of pages) {
    const properties = page.properties;
    const stageProperty = resolveCandidatePropertyName(properties, ['Stage'], 'status');
    const stage = compactText(properties?.[stageProperty ?? '']?.status?.name ?? undefined);

    const emailProperty = resolveCandidatePropertyName(
      properties,
      ['Email', 'Primary Email', 'Contact Email'],
      'email'
    );
    const email = compactText(properties?.[emailProperty ?? '']?.email ?? undefined)?.toLowerCase();
    if (!email) continue;

    if (
      stage !== 'Lead' &&
      stage !== 'Contacted' &&
      stage !== 'Account Started' &&
      stage !== 'Replied'
    ) {
      continue;
    }

    const organizationProperty = resolveCandidatePropertyName(
      properties,
      ['Organization', 'Company', 'Account'],
      'title'
    );
    const organization = compactText(
      extractPlainText(properties?.[organizationProperty ?? '']?.title)
    );

    const contactProperty = resolveCandidatePropertyName(
      properties,
      ['Primary Contact', 'Contact Name', 'Name'],
      'rich_text'
    );
    const primaryContact = compactText(
      extractPlainText(properties?.[contactProperty ?? '']?.rich_text)
    );

    const typeProperty = resolveCandidatePropertyName(properties, ['Type'], 'select');
    const partnerType = normalizePartnerType(
      compactText(properties?.[typeProperty ?? '']?.select?.name ?? undefined)
    );

    const touchProperty = resolveCandidatePropertyName(
      properties,
      ['Times Contacted', 'Times contacted', 'Touch Count'],
      'number'
    );
    const touchCountValue = properties?.[touchProperty ?? '']?.number;
    const touchCount =
      typeof touchCountValue === 'number' && Number.isFinite(touchCountValue)
        ? Math.max(0, Math.floor(touchCountValue))
        : 0;

    const lastContactedProperty = resolveCandidatePropertyName(
      properties,
      ['Last Contacted At', 'Last Contacted'],
      'date'
    );
    const lastContactedAt =
      compactText(properties?.[lastContactedProperty ?? '']?.date?.start ?? undefined) ?? null;

    const nextFollowUpProperty = resolveCandidatePropertyName(
      properties,
      [
        'Next Follow-Up date',
        'Next Follow-Up Date',
        'Next Follow Up Date',
        'Next Follow-Up',
        'Next Follow Up',
      ],
      'date'
    );
    const nextFollowUpAt =
      compactText(properties?.[nextFollowUpProperty ?? '']?.date?.start ?? undefined) ?? null;

    const sourceUrlProperty = resolveCandidatePropertyName(
      properties,
      ['Source URL', 'Website', 'Site'],
      'url'
    );
    const sourceUrl = compactText(properties?.[sourceUrlProperty ?? '']?.url ?? undefined) ?? '';

    const docId = toLeadIdFromEmail(email);
    if (!docId) continue;

    const docRef = input.db.collection(LEADS_COLLECTION).doc(docId);
    const existing = await docRef.get();

    if (!organization && !existing.exists) {
      continue;
    }

    const domain = email.includes('@') ? (email.split('@')[1] ?? '') : '';
    const status = toLeadStatusFromNotionStage(stage, nextFollowUpAt, touchCount);
    if (status === 'converted' && !existing.exists) {
      continue;
    }

    await docRef.set(
      {
        id: docId,
        organization:
          organization ??
          ((existing.data() as Record<string, unknown> | undefined)?.['organization'] as
            | string
            | undefined) ??
          '',
        partnerType,
        domain,
        sourceUrl,
        primaryContact: primaryContact ?? null,
        email,
        status,
        touchCount,
        lastContactedAt,
        nextFollowUpAt: status === 'converted' ? null : nextFollowUpAt,
        paused: status === 'paused',
        replied: status === 'replied',
        updatedAt: new Date().toISOString(),
        discoveredAt: existing.exists
          ? (((existing.data() as Record<string, unknown>)?.['discoveredAt'] as
              | string
              | undefined) ?? new Date().toISOString())
          : new Date().toISOString(),
      },
      { merge: true }
    );
  }
}

function getLimit(value: number | undefined, fallback: number, max = 500): number {
  if (!value || !Number.isFinite(value) || value <= 0) return fallback;
  return Math.min(Math.floor(value), max);
}

function addDays(date: Date, days: number): string {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next.toISOString();
}

function getEasternDayKey(date: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

function getNumberField(record: Record<string, unknown>, key: string): number {
  const value = record[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

async function getRemainingDailyBudget(
  db: FirebaseFirestore.Firestore,
  dayKey: string,
  dailyCap: number
): Promise<number> {
  const doc = await db.collection(DAILY_BUDGET_COLLECTION).doc(dayKey).get();
  if (!doc.exists) return dailyCap;

  const data = (doc.data() as Record<string, unknown>) ?? {};
  const totalSent = getNumberField(data, 'totalSent');
  return Math.max(0, dailyCap - totalSent);
}

async function reserveDailyBudgetSlot(
  db: FirebaseFirestore.Firestore,
  dayKey: string,
  dailyCap: number,
  sequenceStep: OutboundSequenceStep
): Promise<boolean> {
  const docRef = db.collection(DAILY_BUDGET_COLLECTION).doc(dayKey);

  return db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(docRef);
    const data = (snapshot.data() as Record<string, unknown>) ?? {};

    const totalSent = getNumberField(data, 'totalSent');
    const initialSent = getNumberField(data, 'initialSent');
    const followUpSent = getNumberField(data, 'followUpSent');

    if (totalSent >= dailyCap) {
      return false;
    }

    transaction.set(
      docRef,
      {
        dayKey,
        dailyCap,
        totalSent: totalSent + 1,
        initialSent: sequenceStep === 'initial' ? initialSent + 1 : initialSent,
        followUpSent: sequenceStep === 'follow_up' ? followUpSent + 1 : followUpSent,
        updatedAt: new Date().toISOString(),
      },
      { merge: true }
    );

    return true;
  });
}

async function releaseDailyBudgetSlot(
  db: FirebaseFirestore.Firestore,
  dayKey: string,
  sequenceStep: OutboundSequenceStep
): Promise<void> {
  const docRef = db.collection(DAILY_BUDGET_COLLECTION).doc(dayKey);

  await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(docRef);
    if (!snapshot.exists) return;

    const data = (snapshot.data() as Record<string, unknown>) ?? {};
    const totalSent = getNumberField(data, 'totalSent');
    const initialSent = getNumberField(data, 'initialSent');
    const followUpSent = getNumberField(data, 'followUpSent');

    transaction.set(
      docRef,
      {
        totalSent: Math.max(0, totalSent - 1),
        initialSent: sequenceStep === 'initial' ? Math.max(0, initialSent - 1) : initialSent,
        followUpSent: sequenceStep === 'follow_up' ? Math.max(0, followUpSent - 1) : followUpSent,
        updatedAt: new Date().toISOString(),
      },
      { merge: true }
    );
  });
}

function toDate(value: unknown): Date | null {
  if (!value) return null;
  if (value instanceof Date) return value;

  if (typeof value === 'string') {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  if (typeof value === 'object') {
    const candidate = value as { toDate?: () => Date; seconds?: number; _seconds?: number };
    if (typeof candidate.toDate === 'function') return candidate.toDate();
    const seconds =
      typeof candidate.seconds === 'number'
        ? candidate.seconds
        : typeof candidate._seconds === 'number'
          ? candidate._seconds
          : null;
    return seconds === null ? null : new Date(seconds * 1000);
  }

  return null;
}

function parseLeadDoc(id: string, data: Record<string, unknown>): OutboundLeadRecord {
  return {
    id,
    organization: String(data['organization'] ?? ''),
    partnerType: (data['partnerType'] as PartnerType | undefined) ?? 'School/University',
    domain: String(data['domain'] ?? ''),
    sourceUrl: String(data['sourceUrl'] ?? ''),
    primaryContact: typeof data['primaryContact'] === 'string' ? data['primaryContact'] : null,
    email: typeof data['email'] === 'string' ? data['email'] : null,
    phone: typeof data['phone'] === 'string' ? data['phone'] : null,
    status: (data['status'] as LeadStatus | undefined) ?? 'lead',
    touchCount:
      typeof data['touchCount'] === 'number' && Number.isFinite(data['touchCount'])
        ? data['touchCount']
        : 0,
    sendCount:
      typeof data['sendCount'] === 'number' && Number.isFinite(data['sendCount'])
        ? data['sendCount']
        : 0,
    failureCount:
      typeof data['failureCount'] === 'number' && Number.isFinite(data['failureCount'])
        ? data['failureCount']
        : 0,
    lastError: typeof data['lastError'] === 'string' ? data['lastError'] : null,
    discoveredAt: String(data['discoveredAt'] ?? new Date().toISOString()),
    updatedAt: String(data['updatedAt'] ?? new Date().toISOString()),
    lastContactedAt: typeof data['lastContactedAt'] === 'string' ? data['lastContactedAt'] : null,
    nextFollowUpAt: typeof data['nextFollowUpAt'] === 'string' ? data['nextFollowUpAt'] : null,
    notionPageId: typeof data['notionPageId'] === 'string' ? data['notionPageId'] : undefined,
    notionPageUrl: typeof data['notionPageUrl'] === 'string' ? data['notionPageUrl'] : undefined,
    sendLockUntil: typeof data['sendLockUntil'] === 'string' ? data['sendLockUntil'] : null,
    paused: data['paused'] === true,
    replied: data['replied'] === true,
  };
}

async function fetchLeads(
  db: FirebaseFirestore.Firestore,
  limit: number
): Promise<readonly OutboundLeadRecord[]> {
  const snapshot = await db.collection(LEADS_COLLECTION).limit(limit).get();
  return snapshot.docs.map((doc) =>
    parseLeadDoc(doc.id, (doc.data() as Record<string, unknown>) ?? {})
  );
}

function isLeadEligibleForInitialSend(record: OutboundLeadRecord, now: Date): boolean {
  if (record.paused || record.replied) return false;
  if (record.status === 'dead_letter') return false;
  if (record.status !== 'lead') return false;
  if (!record.email) return false;
  const lockUntil = toDate(record.sendLockUntil);
  if (lockUntil && lockUntil.getTime() > now.getTime()) return false;
  return record.touchCount < MAX_AUTOMATED_TOUCHES;
}

function isLeadEligibleForFollowUp(record: OutboundLeadRecord, now: Date): boolean {
  if (record.paused || record.replied) return false;
  if (
    record.status === 'dead_letter' ||
    record.status === 'follow_up_sent' ||
    record.status === 'phone_call_due'
  ) {
    return false;
  }
  if (record.touchCount >= MAX_AUTOMATED_TOUCHES) return false;
  if (!record.email) return false;
  if (record.status !== 'contacted' && record.status !== 'follow_up_due') return false;
  const lockUntil = toDate(record.sendLockUntil);
  if (lockUntil && lockUntil.getTime() > now.getTime()) return false;

  const dueAt = toDate(record.nextFollowUpAt);
  return dueAt !== null && dueAt.getTime() <= now.getTime();
}

async function claimLeadForSend(input: {
  readonly db: FirebaseFirestore.Firestore;
  readonly leadId: string;
  readonly sequenceStep: OutboundSequenceStep;
  readonly now: Date;
}): Promise<OutboundLeadRecord | null> {
  const leadRef = input.db.collection(LEADS_COLLECTION).doc(input.leadId);

  return input.db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(leadRef);
    if (!snapshot.exists) return null;

    const record = parseLeadDoc(
      snapshot.id,
      (snapshot.data() as Record<string, unknown> | undefined) ?? {}
    );

    const lockUntil = toDate(record.sendLockUntil);
    if (lockUntil && lockUntil.getTime() > input.now.getTime()) {
      return null;
    }

    const isEligible =
      input.sequenceStep === 'initial'
        ? isLeadEligibleForInitialSend(record, input.now)
        : isLeadEligibleForFollowUp(record, input.now);

    if (!isEligible) {
      return null;
    }

    transaction.set(
      leadRef,
      {
        sendLockUntil: new Date(input.now.getTime() + SEND_LOCK_TTL_MS).toISOString(),
        updatedAt: input.now.toISOString(),
      },
      { merge: true }
    );

    return record;
  });
}

async function markLeadFailure(
  db: FirebaseFirestore.Firestore,
  record: OutboundLeadRecord,
  error: unknown
): Promise<{ readonly deadLettered: boolean }> {
  const nextFailureCount = record.failureCount + 1;
  const deadLettered = nextFailureCount >= MAX_FAILURES_BEFORE_DEAD_LETTER;
  await db
    .collection(LEADS_COLLECTION)
    .doc(record.id)
    .set(
      {
        failureCount: nextFailureCount,
        status: deadLettered ? 'dead_letter' : record.status,
        lastError: error instanceof Error ? error.message : String(error),
        sendLockUntil: null,
        updatedAt: new Date().toISOString(),
      },
      { merge: true }
    );

  return { deadLettered };
}

export async function runB2BOutboundInitialSend(input: SendInput): Promise<B2BOutboundSendResult> {
  const sendLimit = getLimit(input.limit, DEFAULT_SEND_LIMIT, MAX_PROFESSIONAL_B2B_BATCH);
  const dailyCap = getLimit(input.dailyCap, DEFAULT_DAILY_CAP, MAX_PROFESSIONAL_B2B_BATCH);

  await syncMarketingReplyMailbox({ db: input.db });
  await syncOutboundQueueFromNotion({
    db: input.db,
    environment: input.environment,
    limit: NOTION_SYNC_LIMIT,
  });

  const now = new Date();
  const dayKey = getEasternDayKey(now);
  const remainingBudget = await getRemainingDailyBudget(input.db, dayKey, dailyCap);
  const leads = await fetchLeads(input.db, 500);
  const eligible = leads
    .filter((record) => isLeadEligibleForInitialSend(record, now))
    .slice(0, sendLimit);

  let attempted = 0;
  let sent = 0;
  let failed = 0;
  let skippedNoEmail = 0;
  let deadLettered = 0;

  const maxSends = Math.min(remainingBudget, eligible.length);

  for (const record of eligible.slice(0, maxSends)) {
    const claimedRecord = await claimLeadForSend({
      db: input.db,
      leadId: record.id,
      sequenceStep: 'initial',
      now,
    });

    if (!claimedRecord) {
      continue;
    }

    if (!claimedRecord.email) {
      skippedNoEmail += 1;
      continue;
    }

    const reserved = await reserveDailyBudgetSlot(input.db, dayKey, dailyCap, 'initial');
    if (!reserved) {
      break;
    }

    attempted += 1;

    try {
      await sendFoundation50CoachesEmail({
        email: claimedRecord.email,
        firstName: claimedRecord.primaryContact,
        organizationName: claimedRecord.organization,
        environment: input.environment,
      });

      const followUpAt = addDays(now, FIRST_FOLLOW_UP_DELAY_DAYS);
      await upsertB2BOutboundLead({
        environment: input.environment,
        organization: claimedRecord.organization,
        email: claimedRecord.email,
        primaryContact: claimedRecord.primaryContact,
        partnerType: claimedRecord.partnerType,
        stage: 'Contacted',
        timesContacted: claimedRecord.touchCount + 1,
        lastContactedAt: now,
        nextFollowUpAt: followUpAt,
        nextAction: `Initial outreach sent. Follow up due ${followUpAt.slice(0, 10)}.`,
        sourceUrl: claimedRecord.sourceUrl,
        notes: `Automated outbound initial send completed at ${now.toISOString()}.`,
      });

      await input.db
        .collection(LEADS_COLLECTION)
        .doc(claimedRecord.id)
        .set(
          {
            status: 'contacted',
            touchCount: claimedRecord.touchCount + 1,
            sendCount: claimedRecord.sendCount + 1,
            lastContactedAt: now.toISOString(),
            nextFollowUpAt: followUpAt,
            lastError: null,
            sendLockUntil: null,
            updatedAt: now.toISOString(),
          },
          { merge: true }
        );

      sent += 1;
    } catch (error) {
      failed += 1;
      await releaseDailyBudgetSlot(input.db, dayKey, 'initial');
      const failureResult = await markLeadFailure(input.db, claimedRecord, error);
      if (failureResult.deadLettered) deadLettered += 1;
    }
  }

  return {
    selected: eligible.length,
    attempted,
    sent,
    failed,
    skippedNoEmail,
    deadLettered,
  };
}

export async function runB2BOutboundFollowUpSend(input: SendInput): Promise<B2BOutboundSendResult> {
  const sendLimit = getLimit(input.limit, DEFAULT_SEND_LIMIT, MAX_PROFESSIONAL_B2B_BATCH);
  const dailyCap = getLimit(input.dailyCap, DEFAULT_DAILY_CAP, MAX_PROFESSIONAL_B2B_BATCH);

  await syncMarketingReplyMailbox({ db: input.db });
  await syncOutboundQueueFromNotion({
    db: input.db,
    environment: input.environment,
    limit: NOTION_SYNC_LIMIT,
  });

  const now = new Date();
  const dayKey = getEasternDayKey(now);
  const remainingBudget = await getRemainingDailyBudget(input.db, dayKey, dailyCap);
  const leads = await fetchLeads(input.db, 500);
  const eligible = leads
    .filter((record) => isLeadEligibleForFollowUp(record, now))
    .slice(0, sendLimit);

  let attempted = 0;
  let sent = 0;
  let failed = 0;
  let skippedNoEmail = 0;
  let deadLettered = 0;

  const maxSends = Math.min(remainingBudget, eligible.length);

  for (const record of eligible.slice(0, maxSends)) {
    const claimedRecord = await claimLeadForSend({
      db: input.db,
      leadId: record.id,
      sequenceStep: 'follow_up',
      now,
    });

    if (!claimedRecord) {
      continue;
    }

    if (!claimedRecord.email) {
      skippedNoEmail += 1;
      continue;
    }

    const reserved = await reserveDailyBudgetSlot(input.db, dayKey, dailyCap, 'follow_up');
    if (!reserved) {
      break;
    }

    attempted += 1;

    try {
      const nextTouchCount = claimedRecord.touchCount + 1;
      const needsSecondFollowUp = nextTouchCount < MAX_AUTOMATED_TOUCHES;

      await sendB2BPartnerBrandAwarenessEmail({
        email: claimedRecord.email,
        firstName: claimedRecord.primaryContact,
        organization: claimedRecord.organization,
        sequenceStep: needsSecondFollowUp ? 'follow_up' : 'final_follow_up',
      });

      const followUpAt = needsSecondFollowUp ? addDays(now, SECOND_FOLLOW_UP_DELAY_DAYS) : null;
      const nextAction = needsSecondFollowUp
        ? `Final follow-up due ${followUpAt?.slice(0, 10)}.`
        : 'Automated follow-ups complete. Phone call due.';
      const nextStatus: LeadStatus = needsSecondFollowUp ? 'contacted' : 'phone_call_due';
      const notes = needsSecondFollowUp
        ? `Automated outbound follow-up sent at ${now.toISOString()}. Final follow-up scheduled.`
        : `Automated outbound final follow-up sent at ${now.toISOString()}. Hand off to phone call.`;

      await upsertB2BOutboundLead({
        environment: input.environment,
        organization: claimedRecord.organization,
        email: claimedRecord.email,
        primaryContact: claimedRecord.primaryContact,
        partnerType: claimedRecord.partnerType,
        stage: needsSecondFollowUp ? 'Contacted' : 'Phone Call Due',
        timesContacted: nextTouchCount,
        lastContactedAt: now,
        nextFollowUpAt: followUpAt,
        nextAction,
        sourceUrl: claimedRecord.sourceUrl,
        notes,
      });

      await input.db
        .collection(LEADS_COLLECTION)
        .doc(claimedRecord.id)
        .set(
          {
            status: nextStatus,
            touchCount: nextTouchCount,
            sendCount: claimedRecord.sendCount + 1,
            lastContactedAt: now.toISOString(),
            nextFollowUpAt: followUpAt,
            lastError: null,
            sendLockUntil: null,
            updatedAt: now.toISOString(),
          },
          { merge: true }
        );

      sent += 1;
    } catch (error) {
      failed += 1;
      await releaseDailyBudgetSlot(input.db, dayKey, 'follow_up');
      const failureResult = await markLeadFailure(input.db, claimedRecord, error);
      if (failureResult.deadLettered) deadLettered += 1;
    }
  }

  return {
    selected: eligible.length,
    attempted,
    sent,
    failed,
    skippedNoEmail,
    deadLettered,
  };
}
