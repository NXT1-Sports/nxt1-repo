#!/usr/bin/env tsx
/**
 * @fileoverview Audit and optionally repair duplicate Investors & Partnerships Notion leads.
 * @module @nxt1/backend/scripts
 *
 * Usage:
 *   npx tsx --tsconfig tsconfig.scripts.json --import dotenv/config scripts/data-migrations/repair-investors-partnerships-notion-duplicate-leads.ts --env=production
 *   npx tsx --tsconfig tsconfig.scripts.json --import dotenv/config scripts/data-migrations/repair-investors-partnerships-notion-duplicate-leads.ts --env=production --only=partnerships@kitmanlabs.com
 *   npx tsx --tsconfig tsconfig.scripts.json --import dotenv/config scripts/data-migrations/repair-investors-partnerships-notion-duplicate-leads.ts --env=production --commit
 */

import 'dotenv/config';

import { db as productionDb } from '../../src/utils/firebase.js';
import { stagingDb } from '../../src/utils/firebase-staging.js';
import type { RuntimeEnvironment } from '../../src/config/runtime-environment.js';
import {
  getNotionInvestorsPartnershipsConfig,
  getNotionSignupDashboardDisabledReason,
  type NotionSignupDashboardConfig,
} from '../../src/services/marketing/integrations/notion/notion-client.service.js';
import { readIntegerPropertyByCandidates } from '../../src/services/marketing/integrations/notion/notion-property-helpers.js';

const LEADS_COLLECTION = 'MarketingInvestorsPartnershipOutboundLeads';
const MAX_AUTOMATED_TOUCHES = 3;
const MAX_ATTEMPTS = 4;
const MIN_TIMEOUT_MS = 15_000;

type LeadType =
  | 'Investor'
  | 'Integration Partner'
  | 'Partnership'
  | 'Strategic Partner'
  | 'School/University'
  | 'Club/Academy'
  | 'Facility/Complex'
  | 'Other';

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

interface NotionRichTextItem {
  readonly plain_text?: string;
  readonly text?: { readonly content?: string };
}

interface NotionPropertyValue {
  readonly type?: string;
  readonly title?: unknown[];
  readonly rich_text?: unknown[];
  readonly email?: string | null;
  readonly phone_number?: string | null;
  readonly status?: { readonly name?: string | null } | null;
  readonly select?: { readonly name?: string | null } | null;
  readonly date?: { readonly start?: string | null } | null;
  readonly url?: string | null;
  readonly number?: number | null;
}

interface NotionPage {
  readonly id: string;
  readonly url?: string;
  readonly properties?: Record<string, NotionPropertyValue>;
}

interface NotionQueryResponse {
  readonly results?: readonly NotionPage[];
  readonly has_more?: boolean;
  readonly next_cursor?: string | null;
}

interface FirestoreLeadRecord {
  readonly id: string;
  readonly organization: string;
  readonly leadType: LeadType;
  readonly domain: string;
  readonly sourceUrl: string;
  readonly primaryContact: string | null;
  readonly email: string | null;
  readonly phone: string | null;
  readonly status: LeadStatus;
  readonly touchCount: number;
  readonly discoveredAt: string | null;
  readonly lastContactedAt: string | null;
  readonly nextFollowUpAt: string | null;
  readonly notionPageId?: string | null;
  readonly notionPageUrl?: string | null;
  readonly paused: boolean;
  readonly replied: boolean;
}

interface NotionLeadSyncCandidate {
  readonly docId: string;
  readonly pageId: string;
  readonly pageUrl?: string;
  readonly organization: string | null;
  readonly primaryContact: string | null;
  readonly leadType: LeadType;
  readonly sourceUrl: string;
  readonly email: string;
  readonly phone: string | null;
  readonly status: LeadStatus;
  readonly touchCount: number;
  readonly lastContactedAt: string | null;
  readonly nextFollowUpAt: string | null;
}

interface RepairPlan {
  readonly docId: string;
  readonly email: string;
  readonly canonical: NotionLeadSyncCandidate;
  readonly duplicatePageIds: readonly string[];
  readonly finalStatus: LeadStatus;
  readonly finalTouchCount: number;
  readonly finalLastContactedAt: string | null;
  readonly finalNextFollowUpAt: string | null;
  readonly needsFirestoreUpdate: boolean;
  readonly needsCanonicalUpdate: boolean;
  readonly existingLead: FirestoreLeadRecord | null;
}

const args = process.argv.slice(2);

function hasFlag(flag: string): boolean {
  return args.includes(flag);
}

function getArg(name: string): string | null {
  return (
    args
      .find((arg) => arg.startsWith(`--${name}=`))
      ?.split('=')
      .slice(1)
      .join('=') ?? null
  );
}

function resolveEnvironment(): RuntimeEnvironment {
  const value = getArg('env');
  return value === 'production' ? 'production' : 'staging';
}

function parsePositiveInteger(value: string | null): number | null {
  if (!value) return null;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

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
  properties: Record<string, NotionPropertyValue> | undefined,
  candidates: readonly string[],
  expectedType: string
): string | null {
  if (!properties) return null;

  for (const candidate of candidates) {
    const property = properties[candidate];
    if (property && (!property.type || property.type === expectedType)) {
      return candidate;
    }
  }

  return null;
}

function normalizeLeadType(value: string | undefined): LeadType {
  const normalized = value?.trim().toLowerCase();
  if (!normalized) return 'Partnership';
  if (normalized.includes('investor')) return 'Investor';
  if (normalized.includes('integration')) return 'Integration Partner';
  if (normalized.includes('strategic')) return 'Strategic Partner';
  if (normalized === 'partnership' || normalized.includes('partner')) return 'Partnership';
  if (normalized.includes('club') || normalized.includes('academy')) return 'Club/Academy';
  if (normalized.includes('facility') || normalized.includes('complex')) return 'Facility/Complex';
  if (normalized.includes('school') || normalized.includes('university')) {
    return 'School/University';
  }
  return 'Other';
}

function toLeadIdFromEmail(email: string): string {
  return email
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
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

function toIsoString(value: unknown): string | null {
  const date = toDate(value);
  return date ? date.toISOString() : null;
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

function normalizeNotionDateTime(value: string | null): string | null {
  const date = toDate(value);
  if (!date) return value;

  date.setUTCSeconds(0, 0);
  return date.toISOString();
}

function shouldPreferIncomingLeadStatus(
  existingStatus: LeadStatus | undefined,
  incomingStatus: LeadStatus
): boolean {
  if (!existingStatus) return true;
  return getLeadStatusSyncPriority(incomingStatus) >= getLeadStatusSyncPriority(existingStatus);
}

function normalizeAutomationLimitStatus(status: LeadStatus, touchCount: number): LeadStatus {
  if (touchCount < MAX_AUTOMATED_TOUCHES) return status;

  switch (status) {
    case 'lead':
    case 'contacted':
    case 'follow_up_due':
    case 'follow_up_sent':
      return 'phone_call_due';
    default:
      return status;
  }
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
    phone: preferred.phone ?? secondary.phone,
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
    stage !== 'Phone Call Due' &&
    stage !== 'Paused'
  ) {
    return null;
  }

  const organizationProperty = resolveCandidatePropertyName(
    properties,
    ['Organization / Name', 'Organization', 'Company', 'Account'],
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
  const leadType = normalizeLeadType(
    compactText(properties?.[typeProperty ?? '']?.select?.name ?? undefined)
  );

  const touchCount = Math.max(
    0,
    readIntegerPropertyByCandidates(properties, [
      'Times Contacted',
      'Times contacted',
      'Touch Count',
    ])
  );

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

  const phoneProperty = resolveCandidatePropertyName(
    properties,
    ['Phone', 'Direct Phone'],
    'phone_number'
  );
  const phone = compactText(properties?.[phoneProperty ?? '']?.phone_number ?? undefined) ?? null;

  const docId = toLeadIdFromEmail(email);
  if (!docId) return null;

  return {
    docId,
    pageId: page.id,
    pageUrl: page.url,
    organization: organization ?? null,
    primaryContact: primaryContact ?? null,
    leadType,
    sourceUrl,
    email,
    phone,
    status: toLeadStatusFromNotionStage(stage, nextFollowUpAt, touchCount),
    touchCount,
    lastContactedAt,
    nextFollowUpAt,
  };
}

async function notionRequest<T>(
  config: NotionSignupDashboardConfig,
  path: string,
  init: RequestInit
): Promise<T> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    try {
      const response = await fetch(`${config.apiBaseUrl}${path}`, {
        ...init,
        headers: {
          Authorization: `Bearer ${config.apiToken}`,
          'Content-Type': 'application/json',
          'Notion-Version': config.apiVersion,
        },
        signal: AbortSignal.timeout(Math.max(config.timeoutMs, MIN_TIMEOUT_MS)),
      });

      if (!response.ok) {
        const details = await response.text().catch(() => '');
        throw new Error(`Notion request failed (${response.status}): ${details.slice(0, 500)}`);
      }

      return (await response.json()) as T;
    } catch (error) {
      lastError = error;
      if (attempt >= MAX_ATTEMPTS) {
        break;
      }

      await new Promise((resolve) => setTimeout(resolve, attempt * 500));
    }
  }

  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

async function queryAllNotionPages(
  config: NotionSignupDashboardConfig
): Promise<readonly NotionPage[]> {
  if (!config.databaseId) {
    throw new Error('Missing Notion database id.');
  }

  const results: NotionPage[] = [];
  let cursor: string | null = null;

  while (true) {
    const response = await notionRequest<NotionQueryResponse>(
      config,
      `/databases/${config.databaseId}/query`,
      {
        method: 'POST',
        body: JSON.stringify({
          page_size: 100,
          ...(cursor ? { start_cursor: cursor } : {}),
        }),
      }
    );

    results.push(...(response.results ?? []));

    if (!response.has_more || !response.next_cursor) {
      break;
    }

    cursor = response.next_cursor;
  }

  return results;
}

function parseExistingLead(docId: string, data: Record<string, unknown>): FirestoreLeadRecord {
  const statusRaw = data['status'];
  const status = typeof statusRaw === 'string' ? (statusRaw as LeadStatus) : 'lead';

  return {
    id: docId,
    organization: String(data['organization'] ?? ''),
    leadType: normalizeLeadType(
      typeof data['leadType'] === 'string' ? data['leadType'] : undefined
    ),
    domain: String(data['domain'] ?? ''),
    sourceUrl: String(data['sourceUrl'] ?? ''),
    primaryContact: typeof data['primaryContact'] === 'string' ? data['primaryContact'] : null,
    email: typeof data['email'] === 'string' ? data['email'] : null,
    phone: typeof data['phone'] === 'string' ? data['phone'] : null,
    status,
    touchCount:
      typeof data['touchCount'] === 'number' && Number.isFinite(data['touchCount'])
        ? (data['touchCount'] as number)
        : 0,
    discoveredAt: typeof data['discoveredAt'] === 'string' ? data['discoveredAt'] : null,
    lastContactedAt: toIsoString(data['lastContactedAt']),
    nextFollowUpAt: toIsoString(data['nextFollowUpAt']),
    notionPageId: typeof data['notionPageId'] === 'string' ? data['notionPageId'] : null,
    notionPageUrl: typeof data['notionPageUrl'] === 'string' ? data['notionPageUrl'] : null,
    paused: Boolean(data['paused']),
    replied: Boolean(data['replied']),
  };
}

function mapLeadStatusToNotionStage(status: LeadStatus): string {
  switch (status) {
    case 'lead':
      return 'Lead';
    case 'contacted':
    case 'follow_up_due':
    case 'follow_up_sent':
      return 'Contacted';
    case 'phone_call_due':
      return 'Phone Call Due';
    case 'converted':
      return 'Account Started';
    case 'replied':
      return 'Replied';
    case 'paused':
      return 'Paused';
    case 'bounced':
    case 'dead_letter':
      return 'Bounced';
    default:
      return 'Lead';
  }
}

function buildTimesContactedPropertyValue(propertyType: string | undefined, count: number) {
  const normalizedCount = Math.max(0, Math.floor(count));
  if (propertyType === 'rich_text' || propertyType === 'text') {
    return {
      rich_text: [
        {
          type: 'text',
          text: { content: String(normalizedCount) },
        },
      ],
    };
  }

  return { number: normalizedCount };
}

function buildCanonicalNotionProperties(
  page: NotionPage,
  repair: RepairPlan
): Record<string, unknown> {
  const properties = page.properties;
  const updates: Record<string, unknown> = {};

  const stageProperty = resolveCandidatePropertyName(properties, ['Stage'], 'status');
  if (stageProperty) {
    updates[stageProperty] = { status: { name: mapLeadStatusToNotionStage(repair.finalStatus) } };
  }

  const touchProperty =
    resolveCandidatePropertyName(
      properties,
      ['Times Contacted', 'Times contacted', 'Touch Count'],
      'number'
    ) ??
    resolveCandidatePropertyName(
      properties,
      ['Times Contacted', 'Times contacted', 'Touch Count'],
      'rich_text'
    ) ??
    resolveCandidatePropertyName(
      properties,
      ['Times Contacted', 'Times contacted', 'Touch Count'],
      'text'
    );
  if (touchProperty) {
    updates[touchProperty] = buildTimesContactedPropertyValue(
      properties?.[touchProperty]?.type,
      repair.finalTouchCount
    );
  }

  const lastContactedProperty = resolveCandidatePropertyName(
    properties,
    ['Last Contacted At', 'Last Contacted'],
    'date'
  );
  const notionLastContactedAt = normalizeNotionDateTime(repair.finalLastContactedAt);
  if (lastContactedProperty) {
    updates[lastContactedProperty] = {
      date: notionLastContactedAt ? { start: notionLastContactedAt } : null,
    };
  }

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
  const notionNextFollowUpAt = normalizeNotionDateTime(repair.finalNextFollowUpAt);
  if (nextFollowUpProperty) {
    updates[nextFollowUpProperty] = {
      date: notionNextFollowUpAt ? { start: notionNextFollowUpAt } : null,
    };
  }

  return updates;
}

function createRepairPlan(
  canonical: NotionLeadSyncCandidate,
  pages: readonly NotionLeadSyncCandidate[],
  existingLead: FirestoreLeadRecord | null
): RepairPlan {
  const finalTouchCount = Math.max(existingLead?.touchCount ?? 0, canonical.touchCount);
  const canonicalStatus = normalizeAutomationLimitStatus(canonical.status, finalTouchCount);
  const existingStatus = normalizeAutomationLimitStatus(
    existingLead?.status ?? canonicalStatus,
    finalTouchCount
  );
  const shouldApplyIncomingStatus = shouldPreferIncomingLeadStatus(existingStatus, canonicalStatus);
  const finalStatus = shouldApplyIncomingStatus ? canonicalStatus : existingStatus;
  const finalLastContactedAt = preferLaterIsoDate(
    existingLead?.lastContactedAt ?? null,
    canonical.lastContactedAt
  );
  const finalNextFollowUpAt =
    finalStatus === 'converted' ||
    finalStatus === 'bounced' ||
    finalStatus === 'dead_letter' ||
    finalStatus === 'replied' ||
    finalStatus === 'paused' ||
    finalStatus === 'phone_call_due'
      ? null
      : shouldApplyIncomingStatus
        ? canonical.nextFollowUpAt
        : (existingLead?.nextFollowUpAt ?? canonical.nextFollowUpAt);

  const duplicatePageIds = pages
    .filter((page) => page.pageId !== canonical.pageId)
    .map((page) => page.pageId);
  const normalizedCanonicalLastContactedAt = normalizeNotionDateTime(canonical.lastContactedAt);
  const normalizedFinalLastContactedAt = normalizeNotionDateTime(finalLastContactedAt);
  const normalizedCanonicalNextFollowUpAt = normalizeNotionDateTime(canonical.nextFollowUpAt);
  const normalizedFinalNextFollowUpAt = normalizeNotionDateTime(finalNextFollowUpAt);
  const needsFirestoreUpdate =
    !existingLead ||
    existingLead.status !== finalStatus ||
    existingLead.touchCount !== finalTouchCount ||
    existingLead.lastContactedAt !== finalLastContactedAt ||
    existingLead.nextFollowUpAt !== finalNextFollowUpAt ||
    existingLead.notionPageId !== canonical.pageId ||
    (existingLead.notionPageUrl ?? null) !== (canonical.pageUrl ?? null) ||
    existingLead.leadType !== canonical.leadType ||
    (existingLead.phone ?? null) !== (canonical.phone ?? null) ||
    (existingLead.sourceUrl || '') !== canonical.sourceUrl;
  const needsCanonicalUpdate =
    canonical.status !== finalStatus ||
    canonical.touchCount !== finalTouchCount ||
    normalizedCanonicalLastContactedAt !== normalizedFinalLastContactedAt ||
    normalizedCanonicalNextFollowUpAt !== normalizedFinalNextFollowUpAt;

  return {
    docId: canonical.docId,
    email: canonical.email,
    canonical,
    duplicatePageIds,
    finalStatus,
    finalTouchCount,
    finalLastContactedAt,
    finalNextFollowUpAt,
    needsFirestoreUpdate,
    needsCanonicalUpdate,
    existingLead,
  };
}

function describeRepairDrift(repair: RepairPlan): string[] {
  const drift: string[] = [];

  if (repair.canonical.status !== repair.finalStatus) {
    drift.push(`status:${repair.canonical.status}->${repair.finalStatus}`);
  }

  if (repair.canonical.touchCount !== repair.finalTouchCount) {
    drift.push(`touches:${repair.canonical.touchCount}->${repair.finalTouchCount}`);
  }

  if (repair.canonical.lastContactedAt !== repair.finalLastContactedAt) {
    drift.push(
      `last:${formatNullable(repair.canonical.lastContactedAt)}->${formatNullable(repair.finalLastContactedAt)}`
    );
  }

  if (repair.canonical.nextFollowUpAt !== repair.finalNextFollowUpAt) {
    drift.push(
      `next:${formatNullable(repair.canonical.nextFollowUpAt)}->${formatNullable(repair.finalNextFollowUpAt)}`
    );
  }

  if (repair.existingLead?.notionPageId !== repair.canonical.pageId) {
    drift.push(
      `pageId:${formatNullable(repair.existingLead?.notionPageId)}->${repair.canonical.pageId}`
    );
  }

  return drift;
}

function formatNullable(value: string | null | undefined): string {
  return value ?? 'n/a';
}

async function main(): Promise<void> {
  const environment = resolveEnvironment();
  const shouldCommit = hasFlag('--commit');
  const includeSingletons = hasFlag('--include-singletons');
  const explain = hasFlag('--explain');
  const limit = parsePositiveInteger(getArg('limit'));
  const onlyEmails = new Set(
    (getArg('only') ?? '')
      .split(',')
      .map((value) => value.trim().toLowerCase())
      .filter(Boolean)
  );
  const firestore = environment === 'production' ? productionDb : stagingDb;
  const config = getNotionInvestorsPartnershipsConfig(environment);
  const disabledReason = getNotionSignupDashboardDisabledReason(config);

  if (disabledReason) {
    throw new Error(`Notion investors/partnerships dashboard is unavailable: ${disabledReason}`);
  }

  console.log(
    `[repair-investors-partnerships-notion-duplicate-leads] Environment: ${environment.toUpperCase()}`
  );
  console.log(
    `[repair-investors-partnerships-notion-duplicate-leads] Mode: ${shouldCommit ? 'COMMIT' : 'DRY RUN'}`
  );
  if (includeSingletons) {
    console.log(
      '[repair-investors-partnerships-notion-duplicate-leads] Singleton repair enabled: existing Firestore-backed canonical rows will also be checked for stale Notion fields.'
    );
  }

  const notionPages = await queryAllNotionPages(config);
  const candidates = notionPages
    .map((page) => buildNotionLeadSyncCandidate(page))
    .filter((candidate): candidate is NotionLeadSyncCandidate => Boolean(candidate))
    .filter((candidate) => onlyEmails.size === 0 || onlyEmails.has(candidate.email));

  console.log(
    `[repair-investors-partnerships-notion-duplicate-leads] Candidate rows with supported stages: ${candidates.length}`
  );

  const groups = new Map<string, NotionLeadSyncCandidate[]>();
  for (const candidate of candidates) {
    const current = groups.get(candidate.docId) ?? [];
    current.push(candidate);
    groups.set(candidate.docId, current);
  }

  const candidateGroups = Array.from(groups.values())
    .filter((group) => group.length > 1 || includeSingletons)
    .sort((left, right) => right.length - left.length);
  const limitedGroups = limit ? candidateGroups.slice(0, limit) : candidateGroups;

  console.log(
    `[repair-investors-partnerships-notion-duplicate-leads] Duplicate lead groups found: ${candidateGroups.length}`
  );
  if (limit) {
    console.log(
      `[repair-investors-partnerships-notion-duplicate-leads] Processing limit: ${limitedGroups.length} groups`
    );
  }

  const repairs: RepairPlan[] = [];
  const rawPagesById = new Map<string, NotionPage>(notionPages.map((page) => [page.id, page]));

  for (const group of limitedGroups) {
    const canonical = group.reduce((current, candidate) =>
      mergeNotionLeadSyncCandidate(current, candidate)
    );
    const docSnap = await firestore.collection(LEADS_COLLECTION).doc(canonical.docId).get();
    const existingLead = docSnap.exists
      ? parseExistingLead(
          canonical.docId,
          (docSnap.data() as Record<string, unknown> | undefined) ?? {}
        )
      : null;
    if (group.length === 1 && includeSingletons && !existingLead) {
      continue;
    }
    repairs.push(createRepairPlan(canonical, group, existingLead));
  }

  const impacted = repairs.filter(
    (repair) =>
      repair.duplicatePageIds.length > 0 ||
      repair.needsFirestoreUpdate ||
      repair.needsCanonicalUpdate
  );

  console.log(
    `[repair-investors-partnerships-notion-duplicate-leads] Impacted groups: ${impacted.length}`
  );
  for (const repair of impacted.slice(0, 20)) {
    const drift = explain ? ` | drift=${describeRepairDrift(repair).join(',')}` : '';
    console.log(
      ` - ${repair.email} | canonical=${repair.canonical.pageId} | duplicates=${repair.duplicatePageIds.length} | final=${repair.finalStatus} | touches=${repair.finalTouchCount} | last=${formatNullable(repair.finalLastContactedAt)}${drift}`
    );
  }
  if (impacted.length > 20) {
    console.log(` ... and ${impacted.length - 20} more`);
  }

  if (!shouldCommit) {
    console.log(
      '[repair-investors-partnerships-notion-duplicate-leads] Dry run complete. Re-run with --commit to apply.'
    );
    return;
  }

  let firestoreUpdated = 0;
  let notionCanonicalUpdated = 0;
  let notionArchived = 0;

  for (const repair of impacted) {
    if (repair.needsFirestoreUpdate) {
      const domain = repair.email.includes('@') ? (repair.email.split('@')[1] ?? '') : '';
      await firestore
        .collection(LEADS_COLLECTION)
        .doc(repair.docId)
        .set(
          {
            id: repair.docId,
            organization: repair.canonical.organization ?? repair.existingLead?.organization ?? '',
            leadType: repair.canonical.leadType,
            domain,
            sourceUrl: repair.canonical.sourceUrl || repair.existingLead?.sourceUrl || '',
            primaryContact:
              repair.canonical.primaryContact ?? repair.existingLead?.primaryContact ?? null,
            email: repair.email,
            phone: repair.canonical.phone ?? repair.existingLead?.phone ?? null,
            status: repair.finalStatus,
            touchCount: repair.finalTouchCount,
            lastContactedAt: repair.finalLastContactedAt,
            nextFollowUpAt: repair.finalNextFollowUpAt,
            paused: repair.finalStatus === 'paused',
            replied: repair.finalStatus === 'replied',
            notionPageId: repair.canonical.pageId,
            notionPageUrl: repair.canonical.pageUrl ?? null,
            updatedAt: new Date().toISOString(),
            discoveredAt:
              repair.existingLead?.discoveredAt ??
              repair.finalLastContactedAt ??
              new Date().toISOString(),
          },
          { merge: true }
        );
      firestoreUpdated += 1;
    }

    if (repair.needsCanonicalUpdate) {
      const rawCanonicalPage = rawPagesById.get(repair.canonical.pageId);
      if (rawCanonicalPage) {
        const properties = buildCanonicalNotionProperties(rawCanonicalPage, repair);
        if (Object.keys(properties).length > 0) {
          await notionRequest(config, `/pages/${repair.canonical.pageId}`, {
            method: 'PATCH',
            body: JSON.stringify({ properties }),
          });
          notionCanonicalUpdated += 1;
        }
      }
    }

    for (const duplicatePageId of repair.duplicatePageIds) {
      await notionRequest(config, `/pages/${duplicatePageId}`, {
        method: 'PATCH',
        body: JSON.stringify({ archived: true }),
      });
      notionArchived += 1;
    }
  }

  console.log(
    `[repair-investors-partnerships-notion-duplicate-leads] Firestore docs updated: ${firestoreUpdated}`
  );
  console.log(
    `[repair-investors-partnerships-notion-duplicate-leads] Canonical Notion pages updated: ${notionCanonicalUpdated}`
  );
  console.log(
    `[repair-investors-partnerships-notion-duplicate-leads] Duplicate Notion pages archived: ${notionArchived}`
  );
}

main().catch((error) => {
  console.error('[repair-investors-partnerships-notion-duplicate-leads] Failed:', error);
  process.exit(1);
});
