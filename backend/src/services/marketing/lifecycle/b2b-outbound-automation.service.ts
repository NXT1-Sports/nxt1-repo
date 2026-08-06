/**
 * @fileoverview Automated B2B outbound lifecycle service
 * @module @nxt1/backend/services/marketing/lifecycle/b2b-outbound-automation
 */

import type { RuntimeEnvironment } from '../../../config/runtime-environment.js';
import { MarketingEmailDispatchModel } from '../../../models/marketing/marketing-email-dispatch.model.js';
import {
  getNotionSignupDashboardConfig,
  getNotionSignupDashboardDisabledReason,
  type NotionSignupDashboardConfig,
} from '../integrations/notion/notion-client.service.js';
import { syncMarketingReplyMailbox } from './marketing-reply-mailbox-sync.service.js';
import { classifyOutboundBounceFailure } from './outbound-bounce-classifier.service.js';
import { sendB2BPartnerBrandAwarenessEmail } from '../email/campaigns/b2b/b2b-partner-brand-awareness-email.service.js';
import { upsertB2BOutboundLead } from '../integrations/notion/signup-dashboard-entry.service.js';
import { logger } from '../../../utils/logger.js';

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
  | 'bounced'
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
  readonly bouncedAt?: string | null;
  readonly bounceReason?: string | null;
  readonly lastBudgetDayKey?: string | null;
  readonly lastBudgetSequenceStep?: OutboundSequenceStep | null;
  readonly budgetReclaimedAt?: string | null;
}

export interface B2BOutboundSendResult {
  readonly selected: number;
  readonly attempted: number;
  readonly sent: number;
  readonly failed: number;
  readonly skippedNoEmail: number;
  readonly deadLettered: number;
}

export interface B2BPhoneCallDueReconciliationCandidate {
  readonly id: string;
  readonly organization: string;
  readonly email: string | null;
  readonly status: LeadStatus;
  readonly touchCount: number;
  readonly lastContactedAt: string | null;
}

export interface B2BPhoneCallDueReconciliationResult {
  readonly inspected: number;
  readonly eligible: number;
  readonly updated: number;
  readonly dryRun: boolean;
  readonly candidates: readonly B2BPhoneCallDueReconciliationCandidate[];
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
  readonly url?: string;
  readonly properties?: Record<string, NotionPageProperty>;
}

interface NotionQueryResponse {
  readonly results?: readonly NotionPage[];
  readonly has_more?: boolean;
  readonly next_cursor?: string | null;
}

interface NotionLeadSyncCandidate {
  readonly docId: string;
  readonly pageId: string;
  readonly pageUrl?: string;
  readonly organization: string | null;
  readonly primaryContact: string | null;
  readonly partnerType: PartnerType;
  readonly sourceUrl: string;
  readonly email: string;
  readonly status: LeadStatus;
  readonly touchCount: number;
  readonly lastContactedAt: string | null;
  readonly nextFollowUpAt: string | null;
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
  if (normalized === 'phone call due') {
    if (touchCount < MAX_AUTOMATED_TOUCHES) {
      if (nextFollowUpAt) {
        const dueAt = toDate(nextFollowUpAt);
        if (dueAt && dueAt.getTime() <= Date.now()) {
          return 'follow_up_due';
        }
        return 'contacted';
      }
      if (touchCount > 0) {
        return 'follow_up_due';
      }
    }
    return 'phone_call_due';
  }

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

  if (normalized === 'bounced') return 'bounced';
  if (normalized === 'replied') return 'replied';
  if (normalized === 'paused') return 'paused';

  return 'lead';
}

function getLeadStatusSyncPriority(status: LeadStatus): number {
  switch (status) {
    case 'bounced':
      return 100;
    case 'dead_letter':
      return 95;
    case 'converted':
      return 90;
    case 'replied':
      return 85;
    case 'paused':
      return 80;
    case 'phone_call_due':
      return 70;
    case 'follow_up_sent':
      return 60;
    case 'follow_up_due':
      return 50;
    case 'contacted':
      return 40;
    case 'lead':
    default:
      return 10;
  }
}

function compareIsoDateStrings(left: string | null, right: string | null): number {
  const leftTime = toDate(left)?.getTime() ?? Number.NEGATIVE_INFINITY;
  const rightTime = toDate(right)?.getTime() ?? Number.NEGATIVE_INFINITY;

  if (leftTime === rightTime) return 0;
  return leftTime > rightTime ? 1 : -1;
}

function preferLaterIsoDate(left: string | null, right: string | null): string | null {
  return compareIsoDateStrings(left, right) >= 0 ? left : right;
}

function shouldPreferIncomingLeadStatus(
  existingStatus: LeadStatus | undefined,
  incomingStatus: LeadStatus
): boolean {
  if (!existingStatus) return true;
  return getLeadStatusSyncPriority(incomingStatus) >= getLeadStatusSyncPriority(existingStatus);
}

function mergeNotionLeadSyncCandidate(
  current: NotionLeadSyncCandidate,
  next: NotionLeadSyncCandidate
): NotionLeadSyncCandidate {
  const currentPriority = getLeadStatusSyncPriority(current.status);
  const nextPriority = getLeadStatusSyncPriority(next.status);
  const shouldPreferNext =
    nextPriority > currentPriority ||
    (nextPriority === currentPriority && next.touchCount > current.touchCount) ||
    (nextPriority === currentPriority &&
      next.touchCount === current.touchCount &&
      compareIsoDateStrings(next.lastContactedAt, current.lastContactedAt) > 0);

  const preferred = shouldPreferNext ? next : current;
  const secondary = shouldPreferNext ? current : next;
  const nextFollowUpAt =
    preferred.status === 'bounced' ||
    preferred.status === 'converted' ||
    preferred.status === 'replied' ||
    preferred.status === 'paused' ||
    preferred.status === 'phone_call_due' ||
    preferred.status === 'dead_letter'
      ? null
      : preferLaterIsoDate(preferred.nextFollowUpAt, secondary.nextFollowUpAt);

  return {
    ...preferred,
    organization: preferred.organization ?? secondary.organization,
    primaryContact: preferred.primaryContact ?? secondary.primaryContact,
    sourceUrl: preferred.sourceUrl || secondary.sourceUrl,
    touchCount: Math.max(preferred.touchCount, secondary.touchCount),
    lastContactedAt: preferLaterIsoDate(preferred.lastContactedAt, secondary.lastContactedAt),
    nextFollowUpAt,
  };
}

function buildNotionLeadSyncCandidate(page: NotionPage): NotionLeadSyncCandidate | null {
  const properties = page.properties;
  const stageProperty = resolveCandidatePropertyName(properties, ['Stage'], 'status');
  const stage = compactText(properties?.[stageProperty ?? '']?.status?.name ?? undefined);

  const emailProperty = resolveCandidatePropertyName(
    properties,
    ['Email', 'Primary Email', 'Contact Email'],
    'email'
  );
  const email = compactText(properties?.[emailProperty ?? '']?.email ?? undefined)?.toLowerCase();
  if (!email) return null;

  if (
    stage !== 'Lead' &&
    stage !== 'Contacted' &&
    stage !== 'Account Started' &&
    stage !== 'Replied' &&
    stage !== 'Bounced' &&
    stage !== 'Phone Call Due'
  ) {
    return null;
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
  if (!docId) return null;

  return {
    docId,
    pageId: page.id,
    pageUrl: page.url,
    organization: organization ?? null,
    primaryContact: primaryContact ?? null,
    partnerType,
    sourceUrl,
    email,
    status: toLeadStatusFromNotionStage(stage, nextFollowUpAt, touchCount),
    touchCount,
    lastContactedAt,
    nextFollowUpAt,
  };
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

  const leadPagesById = new Map<string, NotionLeadSyncCandidate>();

  for (const page of pages) {
    const candidate = buildNotionLeadSyncCandidate(page);
    if (!candidate) continue;

    const current = leadPagesById.get(candidate.docId);
    leadPagesById.set(
      candidate.docId,
      current ? mergeNotionLeadSyncCandidate(current, candidate) : candidate
    );
  }

  for (const candidate of leadPagesById.values()) {
    const docId = candidate.docId;

    const docRef = input.db.collection(LEADS_COLLECTION).doc(docId);
    const existing = await docRef.get();
    const existingData = (existing.data() as Record<string, unknown> | undefined) ?? undefined;

    if (!candidate.organization && !existing.exists) {
      continue;
    }

    if (candidate.status === 'converted' && !existing.exists) {
      continue;
    }

    const domain = candidate.email.includes('@') ? (candidate.email.split('@')[1] ?? '') : '';
    const existingStatusRaw = existingData?.['status'];
    const existingStatus =
      typeof existingStatusRaw === 'string' ? (existingStatusRaw as LeadStatus) : undefined;
    const shouldApplyIncomingStatus = shouldPreferIncomingLeadStatus(
      existingStatus,
      candidate.status
    );
    const status = shouldApplyIncomingStatus
      ? candidate.status
      : (existingStatus ?? candidate.status);
    const existingTouchCount =
      typeof existingData?.['touchCount'] === 'number' &&
      Number.isFinite(existingData['touchCount'])
        ? (existingData['touchCount'] as number)
        : 0;
    const existingLastContactedAt =
      typeof existingData?.['lastContactedAt'] === 'string'
        ? (existingData['lastContactedAt'] as string)
        : null;
    const existingNextFollowUpAt =
      typeof existingData?.['nextFollowUpAt'] === 'string'
        ? (existingData['nextFollowUpAt'] as string)
        : null;
    const touchCount = Math.max(existingTouchCount, candidate.touchCount);
    const lastContactedAt = preferLaterIsoDate(existingLastContactedAt, candidate.lastContactedAt);
    const nextFollowUpAt =
      status === 'converted' ||
      status === 'bounced' ||
      status === 'replied' ||
      status === 'paused' ||
      status === 'phone_call_due'
        ? null
        : shouldApplyIncomingStatus
          ? candidate.nextFollowUpAt
          : (existingNextFollowUpAt ?? candidate.nextFollowUpAt);

    await docRef.set(
      {
        id: docId,
        organization:
          candidate.organization ?? (existingData?.['organization'] as string | undefined) ?? '',
        partnerType: candidate.partnerType,
        domain,
        sourceUrl: candidate.sourceUrl,
        primaryContact: candidate.primaryContact ?? null,
        email: candidate.email,
        status,
        touchCount,
        lastContactedAt,
        nextFollowUpAt,
        paused: status === 'paused',
        replied: status === 'replied',
        sendLockUntil: status === 'bounced' ? null : undefined,
        notionPageId: candidate.pageId,
        notionPageUrl: candidate.pageUrl ?? null,
        updatedAt: new Date().toISOString(),
        discoveredAt: existing.exists
          ? ((existingData?.['discoveredAt'] as string | undefined) ?? new Date().toISOString())
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
  dailyCap: number,
  sequenceStep: OutboundSequenceStep
): Promise<number> {
  const doc = await db.collection(DAILY_BUDGET_COLLECTION).doc(dayKey).get();
  if (!doc.exists) return dailyCap;

  const data = (doc.data() as Record<string, unknown>) ?? {};
  const spentForStep =
    sequenceStep === 'initial'
      ? getNumberField(data, 'initialSent')
      : getNumberField(data, 'followUpSent');
  return Math.max(0, dailyCap - spentForStep);
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

    const spentForStep = sequenceStep === 'initial' ? initialSent : followUpSent;

    if (spentForStep >= dailyCap) {
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
  const lastBudgetSequenceStepRaw = data['lastBudgetSequenceStep'];
  const lastBudgetSequenceStep =
    lastBudgetSequenceStepRaw === 'initial' || lastBudgetSequenceStepRaw === 'follow_up'
      ? lastBudgetSequenceStepRaw
      : null;

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
    bouncedAt: typeof data['bouncedAt'] === 'string' ? data['bouncedAt'] : null,
    bounceReason: typeof data['bounceReason'] === 'string' ? data['bounceReason'] : null,
    lastBudgetDayKey:
      typeof data['lastBudgetDayKey'] === 'string' ? data['lastBudgetDayKey'] : null,
    lastBudgetSequenceStep: lastBudgetSequenceStep,
    budgetReclaimedAt:
      typeof data['budgetReclaimedAt'] === 'string' ? data['budgetReclaimedAt'] : null,
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

function readDispatchMetadataString(metadata: unknown, key: string): string | null {
  if (!metadata || typeof metadata !== 'object') return null;
  const value = (metadata as Record<string, unknown>)[key];
  return typeof value === 'string' && value.trim().length > 0 ? value : null;
}

async function markDispatchBounceApplied(
  dispatchId: string,
  now: Date,
  result: 'applied' | 'lead_missing'
): Promise<void> {
  await MarketingEmailDispatchModel.updateOne(
    { dispatchId },
    {
      $set: {
        'metadata.bounceAppliedAt': now.toISOString(),
        'metadata.bounceAppliedResult': result,
      },
    }
  );
}

async function reconcileBouncedDispatches(
  db: FirebaseFirestore.Firestore,
  environment: RuntimeEnvironment
): Promise<number> {
  const bouncedDispatches = await MarketingEmailDispatchModel.find({
    environment,
    sendStatus: 'bounced',
    'metadata.outboundLeadKind': 'b2b',
    'metadata.outboundLeadId': { $exists: true },
    'metadata.bounceAppliedAt': { $exists: false },
  })
    .sort({ bouncedAt: 1, updatedAt: 1 })
    .limit(100);

  let appliedCount = 0;

  for (const dispatch of bouncedDispatches) {
    const leadId = readDispatchMetadataString(dispatch.metadata, 'outboundLeadId');
    if (!leadId) continue;

    const now = new Date();
    const leadRef = db.collection(LEADS_COLLECTION).doc(leadId);
    const snapshot = await leadRef.get();
    if (!snapshot.exists) {
      await markDispatchBounceApplied(dispatch.dispatchId, now, 'lead_missing');
      continue;
    }

    const record = parseLeadDoc(
      snapshot.id,
      (snapshot.data() as Record<string, unknown> | undefined) ?? {}
    );
    const bouncedAt = dispatch.bouncedAt ?? dispatch.lastEventAt ?? now;
    const bouncedAtIso = bouncedAt.toISOString();
    const reason =
      typeof dispatch.failureReason === 'string' && dispatch.failureReason.trim().length > 0
        ? dispatch.failureReason
        : `Provider reported bounced status for campaign ${dispatch.campaignKey}.`;

    let budgetReclaimedAt = record.budgetReclaimedAt;
    if (!budgetReclaimedAt && record.lastBudgetDayKey && record.lastBudgetSequenceStep) {
      await releaseDailyBudgetSlot(db, record.lastBudgetDayKey, record.lastBudgetSequenceStep);
      budgetReclaimedAt = now.toISOString();
    }

    await leadRef.set(
      {
        status: 'bounced',
        lastError: reason,
        bounceReason: reason,
        bouncedAt: record.bouncedAt ?? bouncedAtIso,
        nextFollowUpAt: null,
        sendLockUntil: null,
        budgetReclaimedAt: budgetReclaimedAt ?? null,
        updatedAt: now.toISOString(),
      },
      { merge: true }
    );

    try {
      const notionResult = await upsertB2BOutboundLead({
        environment,
        organization: record.organization,
        pageId: record.notionPageId,
        email: record.email,
        primaryContact: record.primaryContact,
        partnerType: record.partnerType,
        stage: 'Bounced',
        timesContacted: record.touchCount,
        lastContactedAt: record.lastContactedAt,
        nextFollowUpAt: null,
        nextAction: 'Lead bounced. Automated outbound sequence stopped.',
        sourceUrl: record.sourceUrl,
        notes: `Bounce detected at ${bouncedAtIso}. Reason: ${reason}`,
      });

      if (notionResult.status === 'created' || notionResult.status === 'existing') {
        await leadRef.set(
          {
            notionPageId: notionResult.pageId,
            notionPageUrl: notionResult.pageUrl ?? null,
            updatedAt: now.toISOString(),
          },
          { merge: true }
        );
      }
    } catch (error) {
      logger.error('[B2BOutbound] Failed to sync delayed bounced lead to Notion', {
        leadId,
        dispatchId: dispatch.dispatchId,
        error: error instanceof Error ? error.message : String(error),
      });
    }

    await markDispatchBounceApplied(dispatch.dispatchId, now, 'applied');
    appliedCount += 1;
  }

  return appliedCount;
}

export async function reconcileAllPendingB2BBouncedDispatches(input: {
  readonly db: FirebaseFirestore.Firestore;
  readonly environment: RuntimeEnvironment;
}): Promise<{ readonly applied: number; readonly batches: number }> {
  let applied = 0;
  let batches = 0;

  while (true) {
    const batchApplied = await reconcileBouncedDispatches(input.db, input.environment);
    batches += 1;
    applied += batchApplied;

    if (batchApplied < 100) {
      return { applied, batches };
    }
  }
}

async function reclaimBudgetForBouncedLeads(
  db: FirebaseFirestore.Firestore,
  leads: readonly OutboundLeadRecord[]
): Promise<void> {
  for (const lead of leads) {
    if (lead.status !== 'bounced') continue;
    if (!lead.lastBudgetDayKey || !lead.lastBudgetSequenceStep) continue;
    if (lead.budgetReclaimedAt) continue;

    await releaseDailyBudgetSlot(db, lead.lastBudgetDayKey, lead.lastBudgetSequenceStep);
    await db.collection(LEADS_COLLECTION).doc(lead.id).set(
      {
        budgetReclaimedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      { merge: true }
    );
  }
}

function isEligibleForPhoneCallDueReconciliation(lead: OutboundLeadRecord): boolean {
  if (lead.touchCount < MAX_AUTOMATED_TOUCHES) return false;
  return (
    lead.status === 'lead' ||
    lead.status === 'contacted' ||
    lead.status === 'follow_up_due' ||
    lead.status === 'follow_up_sent'
  );
}

async function reconcilePhoneCallDueLeads(input: {
  readonly db: FirebaseFirestore.Firestore;
  readonly leads: readonly OutboundLeadRecord[];
  readonly environment: RuntimeEnvironment;
}): Promise<void> {
  const nowIso = new Date().toISOString();

  for (const lead of input.leads) {
    if (!isEligibleForPhoneCallDueReconciliation(lead)) continue;

    await input.db.collection(LEADS_COLLECTION).doc(lead.id).set(
      {
        status: 'phone_call_due',
        nextFollowUpAt: null,
        sendLockUntil: null,
        updatedAt: nowIso,
      },
      { merge: true }
    );

    try {
      const notionResult = await upsertB2BOutboundLead({
        environment: input.environment,
        organization: lead.organization,
        pageId: lead.notionPageId,
        email: lead.email,
        primaryContact: lead.primaryContact,
        partnerType: lead.partnerType,
        stage: 'Phone Call Due',
        timesContacted: lead.touchCount,
        lastContactedAt: lead.lastContactedAt,
        nextFollowUpAt: null,
        nextAction: 'Automated follow-ups complete. Phone call due.',
        sourceUrl: lead.sourceUrl,
        notes: 'Reconciled to Phone Call Due because Times Contacted reached automation limit.',
      });

      if (notionResult.status === 'created' || notionResult.status === 'existing') {
        await input.db
          .collection(LEADS_COLLECTION)
          .doc(lead.id)
          .set(
            {
              notionPageId: notionResult.pageId,
              notionPageUrl: notionResult.pageUrl ?? null,
              updatedAt: nowIso,
            },
            { merge: true }
          );
      }
    } catch (error) {
      logger.error('[B2BOutbound] Failed to sync phone_call_due reconciliation to Notion', {
        leadId: lead.id,
        email: lead.email,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
}

export async function runB2BPhoneCallDueReconciliation(input: {
  readonly db: FirebaseFirestore.Firestore;
  readonly environment: RuntimeEnvironment;
  readonly limit?: number;
  readonly dryRun?: boolean;
}): Promise<B2BPhoneCallDueReconciliationResult> {
  const leads = await fetchLeads(input.db, getLimit(input.limit, 500, 500));
  const candidates = leads.filter(isEligibleForPhoneCallDueReconciliation);

  if (input.dryRun !== false) {
    return {
      inspected: leads.length,
      eligible: candidates.length,
      updated: 0,
      dryRun: true,
      candidates: candidates.map((lead) => ({
        id: lead.id,
        organization: lead.organization,
        email: lead.email,
        status: lead.status,
        touchCount: lead.touchCount,
        lastContactedAt: lead.lastContactedAt,
      })),
    };
  }

  await reconcilePhoneCallDueLeads({
    db: input.db,
    leads: candidates,
    environment: input.environment,
  });

  return {
    inspected: leads.length,
    eligible: candidates.length,
    updated: candidates.length,
    dryRun: false,
    candidates: candidates.map((lead) => ({
      id: lead.id,
      organization: lead.organization,
      email: lead.email,
      status: lead.status,
      touchCount: lead.touchCount,
      lastContactedAt: lead.lastContactedAt,
    })),
  };
}

async function syncDeadLetterLeadToNotion(input: {
  readonly db: FirebaseFirestore.Firestore;
  readonly record: OutboundLeadRecord;
  readonly environment: RuntimeEnvironment;
  readonly reason: string;
  readonly occurredAt: Date;
}): Promise<void> {
  const notionResult = await upsertB2BOutboundLead({
    environment: input.environment,
    organization: input.record.organization,
    pageId: input.record.notionPageId,
    email: input.record.email,
    primaryContact: input.record.primaryContact,
    partnerType: input.record.partnerType,
    stage: 'Bounced',
    timesContacted: input.record.touchCount,
    lastContactedAt: input.record.lastContactedAt,
    nextFollowUpAt: null,
    nextAction: 'Lead delivery failed. Automated outbound sequence stopped.',
    sourceUrl: input.record.sourceUrl,
    notes: `Outbound send failed before delivery at ${input.occurredAt.toISOString()}. Reason: ${input.reason}`,
  });

  if (notionResult.status === 'created' || notionResult.status === 'existing') {
    await input.db
      .collection(LEADS_COLLECTION)
      .doc(input.record.id)
      .set(
        {
          deadLetterNotionSyncedAt: new Date().toISOString(),
          notionPageId: notionResult.pageId,
          notionPageUrl: notionResult.pageUrl ?? null,
          updatedAt: new Date().toISOString(),
        },
        { merge: true }
      );
  }
}

export async function syncPendingB2BDeadLetterLeadsToNotion(input: {
  readonly db: FirebaseFirestore.Firestore;
  readonly environment: RuntimeEnvironment;
  readonly force?: boolean;
}): Promise<{ readonly processed: number; readonly synced: number; readonly failed: number }> {
  const snapshot = await input.db
    .collection(LEADS_COLLECTION)
    .where('status', '==', 'dead_letter')
    .get();

  let processed = 0;
  let synced = 0;
  let failed = 0;

  for (const doc of snapshot.docs) {
    const raw = (doc.data() as Record<string, unknown> | undefined) ?? {};
    if (!input.force && typeof raw['deadLetterNotionSyncedAt'] === 'string') {
      continue;
    }

    const record = parseLeadDoc(doc.id, raw);
    processed += 1;

    try {
      await syncDeadLetterLeadToNotion({
        db: input.db,
        record,
        environment: input.environment,
        reason: record.lastError ?? 'Outbound send failed before delivery.',
        occurredAt: new Date(record.updatedAt),
      });
      synced += 1;
    } catch (error) {
      failed += 1;
      logger.error('[B2BOutbound] Failed to sync dead-letter lead to Notion', {
        leadId: record.id,
        email: record.email,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return { processed, synced, failed };
}

function isLeadEligibleForInitialSend(record: OutboundLeadRecord, now: Date): boolean {
  if (record.paused || record.replied) return false;
  if (record.status === 'dead_letter' || record.status === 'bounced') return false;
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
    record.status === 'bounced' ||
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
  environment: RuntimeEnvironment,
  error: unknown
): Promise<{ readonly deadLettered: boolean; readonly bounced: boolean }> {
  const now = new Date();
  const { isBounce, message } = classifyOutboundBounceFailure(error);
  const nextFailureCount = record.failureCount + 1;
  const deadLettered = !isBounce && nextFailureCount >= MAX_FAILURES_BEFORE_DEAD_LETTER;
  await db
    .collection(LEADS_COLLECTION)
    .doc(record.id)
    .set(
      {
        failureCount: nextFailureCount,
        status: isBounce ? 'bounced' : deadLettered ? 'dead_letter' : record.status,
        lastError: message,
        bounceReason: isBounce ? message : null,
        bouncedAt: isBounce ? now.toISOString() : null,
        nextFollowUpAt: isBounce ? null : record.nextFollowUpAt,
        sendLockUntil: null,
        updatedAt: now.toISOString(),
      },
      { merge: true }
    );

  if (isBounce) {
    try {
      const notionResult = await upsertB2BOutboundLead({
        environment,
        organization: record.organization,
        pageId: record.notionPageId,
        email: record.email,
        primaryContact: record.primaryContact,
        partnerType: record.partnerType,
        stage: 'Bounced',
        timesContacted: record.touchCount,
        lastContactedAt: record.lastContactedAt,
        nextFollowUpAt: null,
        nextAction: 'Lead bounced. Automated outbound sequence stopped.',
        sourceUrl: record.sourceUrl,
        notes: `Bounce detected at ${now.toISOString()}. Reason: ${message}`,
      });

      logger.info('[B2BOutbound] Synced bounced lead to Notion', {
        leadId: record.id,
        email: record.email,
        notionStatus: notionResult.status,
      });

      if (notionResult.status === 'created' || notionResult.status === 'existing') {
        await db
          .collection(LEADS_COLLECTION)
          .doc(record.id)
          .set(
            {
              notionPageId: notionResult.pageId,
              notionPageUrl: notionResult.pageUrl ?? null,
              updatedAt: now.toISOString(),
            },
            { merge: true }
          );
      }
    } catch (notionError) {
      logger.error('[B2BOutbound] Failed to sync bounced lead to Notion', {
        leadId: record.id,
        email: record.email,
        error: notionError instanceof Error ? notionError.message : String(notionError),
      });
    }
  } else if (deadLettered) {
    try {
      const deadLetterRecord = parseLeadDoc(record.id, {
        ...record,
        status: 'dead_letter',
        lastError: message,
        nextFollowUpAt: null,
        updatedAt: now.toISOString(),
      } as Record<string, unknown>);
      await syncDeadLetterLeadToNotion({
        db,
        record: deadLetterRecord,
        environment,
        reason: message,
        occurredAt: now,
      });
    } catch (notionError) {
      logger.error('[B2BOutbound] Failed to sync dead-letter lead to Notion', {
        leadId: record.id,
        email: record.email,
        error: notionError instanceof Error ? notionError.message : String(notionError),
      });
    }
  }

  return { deadLettered, bounced: isBounce };
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
  await reconcileBouncedDispatches(input.db, input.environment);

  const now = new Date();
  const dayKey = getEasternDayKey(now);
  const leads = await fetchLeads(input.db, 500);
  await reclaimBudgetForBouncedLeads(input.db, leads);
  await reconcilePhoneCallDueLeads({
    db: input.db,
    leads,
    environment: input.environment,
  });
  const remainingBudget = await getRemainingDailyBudget(input.db, dayKey, dailyCap, 'initial');
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

    await input.db.collection(LEADS_COLLECTION).doc(claimedRecord.id).set(
      {
        lastBudgetDayKey: dayKey,
        lastBudgetSequenceStep: 'initial',
        budgetReclaimedAt: null,
        updatedAt: now.toISOString(),
      },
      { merge: true }
    );

    attempted += 1;

    try {
      await sendB2BPartnerBrandAwarenessEmail({
        email: claimedRecord.email,
        firstName: claimedRecord.primaryContact,
        organization: claimedRecord.organization,
        sequenceStep: 'initial',
        metadata: {
          outboundLeadId: claimedRecord.id,
          outboundLeadKind: 'b2b',
          outboundSequenceStep: 'initial',
        },
      });

      const followUpAt = addDays(now, FIRST_FOLLOW_UP_DELAY_DAYS);
      const notionResult = await upsertB2BOutboundLead({
        environment: input.environment,
        organization: claimedRecord.organization,
        pageId: claimedRecord.notionPageId,
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
            notionPageId:
              notionResult.status === 'created' || notionResult.status === 'existing'
                ? notionResult.pageId
                : claimedRecord.notionPageId,
            notionPageUrl:
              notionResult.status === 'created' || notionResult.status === 'existing'
                ? (notionResult.pageUrl ?? null)
                : (claimedRecord.notionPageUrl ?? null),
            updatedAt: now.toISOString(),
          },
          { merge: true }
        );

      sent += 1;
    } catch (error) {
      failed += 1;
      await releaseDailyBudgetSlot(input.db, dayKey, 'initial');
      const failureResult = await markLeadFailure(
        input.db,
        claimedRecord,
        input.environment,
        error
      );
      if (failureResult.bounced) {
        await input.db.collection(LEADS_COLLECTION).doc(claimedRecord.id).set(
          {
            budgetReclaimedAt: now.toISOString(),
            updatedAt: now.toISOString(),
          },
          { merge: true }
        );
      }
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
  await reconcileBouncedDispatches(input.db, input.environment);

  const now = new Date();
  const dayKey = getEasternDayKey(now);
  const leads = await fetchLeads(input.db, 500);
  await reclaimBudgetForBouncedLeads(input.db, leads);
  await reconcilePhoneCallDueLeads({
    db: input.db,
    leads,
    environment: input.environment,
  });
  const remainingBudget = await getRemainingDailyBudget(input.db, dayKey, dailyCap, 'follow_up');
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

    await input.db.collection(LEADS_COLLECTION).doc(claimedRecord.id).set(
      {
        lastBudgetDayKey: dayKey,
        lastBudgetSequenceStep: 'follow_up',
        budgetReclaimedAt: null,
        updatedAt: now.toISOString(),
      },
      { merge: true }
    );

    attempted += 1;

    try {
      const nextTouchCount = claimedRecord.touchCount + 1;
      const needsSecondFollowUp = nextTouchCount < MAX_AUTOMATED_TOUCHES;

      await sendB2BPartnerBrandAwarenessEmail({
        email: claimedRecord.email,
        firstName: claimedRecord.primaryContact,
        organization: claimedRecord.organization,
        sequenceStep: needsSecondFollowUp ? 'follow_up' : 'final_follow_up',
        metadata: {
          outboundLeadId: claimedRecord.id,
          outboundLeadKind: 'b2b',
          outboundSequenceStep: needsSecondFollowUp ? 'follow_up' : 'final_follow_up',
        },
      });

      const followUpAt = needsSecondFollowUp ? addDays(now, SECOND_FOLLOW_UP_DELAY_DAYS) : null;
      const nextAction = needsSecondFollowUp
        ? `Final follow-up due ${followUpAt?.slice(0, 10)}.`
        : 'Automated follow-ups complete. Phone call due.';
      const nextStatus: LeadStatus = needsSecondFollowUp ? 'contacted' : 'phone_call_due';
      const notes = needsSecondFollowUp
        ? `Automated outbound follow-up sent at ${now.toISOString()}. Final follow-up scheduled.`
        : `Automated outbound final follow-up sent at ${now.toISOString()}. Hand off to phone call.`;

      const notionResult = await upsertB2BOutboundLead({
        environment: input.environment,
        organization: claimedRecord.organization,
        pageId: claimedRecord.notionPageId,
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
            notionPageId:
              notionResult.status === 'created' || notionResult.status === 'existing'
                ? notionResult.pageId
                : claimedRecord.notionPageId,
            notionPageUrl:
              notionResult.status === 'created' || notionResult.status === 'existing'
                ? (notionResult.pageUrl ?? null)
                : (claimedRecord.notionPageUrl ?? null),
            updatedAt: now.toISOString(),
          },
          { merge: true }
        );

      sent += 1;
    } catch (error) {
      failed += 1;
      await releaseDailyBudgetSlot(input.db, dayKey, 'follow_up');
      const failureResult = await markLeadFailure(
        input.db,
        claimedRecord,
        input.environment,
        error
      );
      if (failureResult.bounced) {
        await input.db.collection(LEADS_COLLECTION).doc(claimedRecord.id).set(
          {
            budgetReclaimedAt: now.toISOString(),
            updatedAt: now.toISOString(),
          },
          { merge: true }
        );
      }
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

export const __b2bOutboundAutomationTestUtils = {
  buildNotionLeadSyncCandidate,
  isEligibleForPhoneCallDueReconciliation,
  mergeNotionLeadSyncCandidate,
  shouldPreferIncomingLeadStatus,
  toLeadStatusFromNotionStage,
};
