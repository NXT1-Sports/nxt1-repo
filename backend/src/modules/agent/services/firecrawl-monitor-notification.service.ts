import type { Firestore } from 'firebase-admin/firestore';
import type { DispatchNotificationInput } from '@nxt1/core';
import { z } from 'zod';
import { NOTIFICATION_TYPES } from '@nxt1/core';
import { OpenRouterService } from '../llm/openrouter.service.js';
import { resolveStructuredOutput } from '../llm/structured-output.js';
import { logger } from '../../../utils/logger.js';
import { dispatchAgentNotification, type DispatchResult } from './agent-push-adapter.service.js';
import {
  FirecrawlMonitorService,
  type FirecrawlMonitorCheckDetail,
  type FirecrawlMonitorRegistrationRecord,
} from '../tools/integrations/firecrawl/browser/firecrawl-monitor.service.js';

const FIRECRAWL_MONITOR_EVENT_COLLECTION = 'FirecrawlMonitorEvents';
const MAX_NOTIFICATION_NOTABLE_PAGES = 3;
const MAX_STARTUP_PROMPT_NOTABLE_PAGES = 25;
const MAX_LINE_LENGTH = 180;

const monitorCheckSummarySchema = z
  .object({
    totalPages: z.number().int().nonnegative().optional(),
    same: z.number().int().nonnegative().optional(),
    changed: z.number().int().nonnegative().optional(),
    new: z.number().int().nonnegative().optional(),
    removed: z.number().int().nonnegative().optional(),
    error: z.number().int().nonnegative().optional(),
  })
  .passthrough();

const monitorEventBaseSchema = z.object({
  monitorId: z.string().min(1),
  checkId: z.string().min(1),
  status: z.string().min(1),
});

const monitorCheckCompletedEventSchema = monitorEventBaseSchema
  .extend({
    summary: monitorCheckSummarySchema.optional(),
  })
  .passthrough();

const monitorPageEventSchema = monitorEventBaseSchema
  .extend({
    url: z.string().min(1).optional(),
    previousScrapeId: z.string().min(1).optional(),
    currentScrapeId: z.string().min(1).optional(),
    error: z.string().nullable().optional(),
    isMeaningful: z.boolean().optional(),
    judgment: z
      .object({
        meaningful: z.boolean().optional(),
        confidence: z.string().optional(),
        reason: z.string().optional(),
      })
      .passthrough()
      .optional(),
    diff: z
      .object({
        text: z.string().optional(),
      })
      .passthrough()
      .optional(),
  })
  .passthrough();

function toOptionalNonEmptyString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function normalizeFirecrawlMonitorEventItem(
  eventType: 'monitor.page' | 'monitor.check.completed',
  rootEventId: string | null,
  item: unknown,
  success: unknown
): unknown {
  if (typeof item !== 'object' || item === null || Array.isArray(item)) return item;

  const record = { ...(item as Record<string, unknown>) };
  const checkId = toOptionalNonEmptyString(record['checkId']) ?? rootEventId;
  if (checkId && toOptionalNonEmptyString(record['checkId']) === null) {
    record['checkId'] = checkId;
  }

  if (toOptionalNonEmptyString(record['status']) !== null) {
    return record;
  }

  if (eventType === 'monitor.check.completed') {
    const successBool =
      typeof success === 'boolean'
        ? success
        : typeof success === 'string'
          ? success.trim().toLowerCase() === 'true'
          : true;
    record['status'] = successBool ? 'completed' : 'failed';
    return record;
  }

  const itemError = toOptionalNonEmptyString(record['error']);
  const successBool =
    typeof success === 'boolean'
      ? success
      : typeof success === 'string'
        ? success.trim().toLowerCase() === 'true'
        : true;
  record['status'] = itemError || successBool === false ? 'error' : 'changed';
  return record;
}

function normalizeFirecrawlMonitorWebhookPayload(payload: unknown): unknown {
  if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) return payload;

  const normalized = { ...(payload as Record<string, unknown>) };
  const type = normalized['type'];
  if (type !== 'monitor.page' && type !== 'monitor.check.completed') return normalized;

  const normalizedSuccess =
    typeof normalized['success'] === 'string'
      ? normalized['success'].trim().toLowerCase()
      : normalized['success'];
  if (normalizedSuccess === 'true') normalized['success'] = true;
  if (normalizedSuccess === 'false') normalized['success'] = false;

  const rootEventId = toOptionalNonEmptyString(normalized['id']);
  if (Array.isArray(normalized['data'])) {
    normalized['data'] = normalized['data'].map((item) =>
      normalizeFirecrawlMonitorEventItem(type, rootEventId, item, normalized['success'])
    );
  }

  return normalized;
}

const firecrawlMonitorWebhookSchema = z.preprocess(
  normalizeFirecrawlMonitorWebhookPayload,
  z.discriminatedUnion('type', [
    z.object({
      success: z.boolean(),
      type: z.literal('monitor.check.completed'),
      id: z.string().min(1),
      webhookId: z.string().optional(),
      data: z.array(monitorCheckCompletedEventSchema).min(1),
      metadata: z.record(z.string(), z.unknown()).optional(),
      error: z.string().optional(),
    }),
    z.object({
      success: z.boolean(),
      type: z.literal('monitor.page'),
      id: z.string().min(1),
      webhookId: z.string().optional(),
      data: z.array(monitorPageEventSchema).min(1),
      metadata: z.record(z.string(), z.unknown()).optional(),
      error: z.string().optional(),
    }),
  ])
);

const notificationCopySchema = z.object({
  title: z.string().min(1).max(65),
  body: z.string().min(1).max(180),
});

type MonitorCheckSummary = z.infer<typeof monitorCheckSummarySchema>;
type FirecrawlMonitorWebhookPayload = z.infer<typeof firecrawlMonitorWebhookSchema>;
type FirecrawlMonitorWebhookItem = FirecrawlMonitorWebhookPayload['data'][number];

interface NotificationCopy {
  readonly title: string;
  readonly body: string;
}

interface NotablePageSummary {
  readonly url: string;
  readonly status: string;
  readonly reason: string;
}

interface MonitorUpdateHighlight {
  readonly title: string;
  readonly body: string;
}

interface MonitorNotificationDeps {
  readonly monitorService?: Pick<
    FirecrawlMonitorService,
    'getMonitorRegistration' | 'getMonitorCheck' | 'recordMonitorCheckSummaryForOwner'
  >;
  readonly llm?: Pick<OpenRouterService, 'complete'>;
  readonly dispatchNotification?: typeof dispatchAgentNotification;
}

interface ResolvedMonitorNotificationDeps {
  readonly monitorService: Pick<
    FirecrawlMonitorService,
    'getMonitorRegistration' | 'getMonitorCheck' | 'recordMonitorCheckSummaryForOwner'
  >;
  readonly llm?: Pick<OpenRouterService, 'complete'>;
  readonly dispatchNotification: typeof dispatchAgentNotification;
}

export interface ProcessFirecrawlMonitorWebhookResult {
  readonly processedCount: number;
  readonly dispatchedCount: number;
  readonly ignoredCount: number;
}

function truncate(value: string, maxLength: number): string {
  const trimmed = value.replace(/\s+/g, ' ').trim();
  if (trimmed.length <= maxLength) return trimmed;
  return `${trimmed.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`;
}

function sanitizeKey(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 100);
}

function hasUserVisibleChange(
  summary: MonitorCheckSummary | undefined,
  notablePages: readonly NotablePageSummary[]
): boolean {
  if (notablePages.length > 0) return true;
  if (!summary) return false;

  return (
    (summary.changed ?? 0) > 0 ||
    (summary.new ?? 0) > 0 ||
    (summary.removed ?? 0) > 0 ||
    (summary.error ?? 0) > 0
  );
}

function getString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function getMeaningfulReason(page: Record<string, unknown>): string | null {
  const judgment = page['judgment'];
  if (typeof judgment !== 'object' || judgment === null || Array.isArray(judgment)) return null;
  const meaningful = (judgment as Record<string, unknown>)['meaningful'];
  const reason = getString((judgment as Record<string, unknown>)['reason']);
  if (meaningful === true && reason) return reason;
  return null;
}

function getDiffHint(page: Record<string, unknown>): string | null {
  const diff = page['diff'];
  if (typeof diff !== 'object' || diff === null || Array.isArray(diff)) return null;
  const text = getString((diff as Record<string, unknown>)['text']);
  if (!text) return null;
  const firstInterestingLine = text
    .split('\n')
    .map((line) => line.trim())
    .find((line) => line.startsWith('+') || line.startsWith('-'));
  if (!firstInterestingLine) return null;
  return firstInterestingLine.replace(/^[-+]+\s*/, '').trim();
}

function summarizeNotablePagesFromRecords(
  pages: readonly Record<string, unknown>[],
  maxItems = MAX_NOTIFICATION_NOTABLE_PAGES
): readonly NotablePageSummary[] {
  const summaries: NotablePageSummary[] = [];

  for (const page of pages) {
    const status = getString(page['status']) ?? 'changed';
    const url = getString(page['url']) ?? 'Unknown page';
    const meaningfulReason = getMeaningfulReason(page);
    const pageError = getString(page['error']);
    const diffHint = getDiffHint(page);

    const include =
      status === 'new' ||
      status === 'removed' ||
      status === 'error' ||
      meaningfulReason !== null ||
      (status === 'changed' && diffHint !== null);

    if (!include) continue;

    const reason = truncate(
      meaningfulReason ?? pageError ?? diffHint ?? `Page status changed to ${status}.`,
      MAX_LINE_LENGTH
    );

    summaries.push({ url, status, reason });
    if (summaries.length >= maxItems) break;
  }

  return summaries;
}

function summarizeNotablePages(
  check: FirecrawlMonitorCheckDetail,
  maxItems = MAX_NOTIFICATION_NOTABLE_PAGES
): readonly NotablePageSummary[] {
  return summarizeNotablePagesFromRecords(
    check.pages as readonly Record<string, unknown>[],
    maxItems
  );
}

function summarizePageEventItems(
  pages: readonly FirecrawlMonitorWebhookItem[],
  maxItems = MAX_NOTIFICATION_NOTABLE_PAGES
): readonly NotablePageSummary[] {
  return summarizeNotablePagesFromRecords(pages as readonly Record<string, unknown>[], maxItems);
}

function buildPageEventReceiptKey(event: FirecrawlMonitorWebhookItem, index: number): string {
  const pageId =
    getString((event as Record<string, unknown>)['currentScrapeId']) ??
    getString((event as Record<string, unknown>)['url']) ??
    `page-${index + 1}`;

  return sanitizeKey(`firecrawl_monitor_page_${event.monitorId}_${event.checkId}_${pageId}`);
}

function buildMonitorUpdateHighlight(
  registration: FirecrawlMonitorRegistrationRecord,
  notablePages: readonly NotablePageSummary[],
  summary: MonitorCheckSummary | undefined
): MonitorUpdateHighlight | null {
  const firstPage = notablePages[0];
  if (firstPage) {
    const platformLabel = registration.platform.toUpperCase();
    return {
      title: truncate(`${platformLabel}: ${firstPage.reason}`, 65),
      body: truncate(
        `${firstPage.reason} Want me to break down what changed and make the best next move?`,
        180
      ),
    };
  }

  if (!summary) {
    return null;
  }

  const summaryParts = [
    (summary.changed ?? 0) > 0 ? `${summary.changed} changed` : null,
    (summary.new ?? 0) > 0 ? `${summary.new} new` : null,
    (summary.removed ?? 0) > 0 ? `${summary.removed} removed` : null,
    (summary.error ?? 0) > 0 ? `${summary.error} issues` : null,
  ].filter((part): part is string => part !== null);

  if (summaryParts.length === 0) {
    return null;
  }

  return {
    title: truncate(`Agent X found a ${registration.platform} update`, 65),
    body: truncate(
      `${summaryParts.join(', ')} on your ${registration.platform} page. Want me to review what changed and handle the next step?`,
      180
    ),
  };
}

function buildNotificationFallback(
  registration: FirecrawlMonitorRegistrationRecord,
  summary: MonitorCheckSummary | undefined,
  notablePages: readonly NotablePageSummary[]
): NotificationCopy {
  const highlight = buildMonitorUpdateHighlight(registration, notablePages, summary);
  if (highlight) {
    return highlight;
  }

  return {
    title: truncate(`Agent X spotted a ${registration.platform} update`, 65),
    body: truncate(
      `Your monitored ${registration.platform} source changed. Want me to break it down and suggest the best next move?`,
      180
    ),
  };
}

async function generateNotificationCopy(
  llm: Pick<OpenRouterService, 'complete'>,
  params: {
    readonly eventKey: string;
    readonly registration: FirecrawlMonitorRegistrationRecord;
    readonly summary: MonitorCheckSummary | undefined;
    readonly notablePages: readonly NotablePageSummary[];
  }
): Promise<NotificationCopy> {
  const notableLines =
    params.notablePages.length > 0
      ? params.notablePages
          .map((page) => `- ${page.status.toUpperCase()}: ${page.reason} (${page.url})`)
          .join('\n')
      : '- No page-level details were available.';

  const prompt = `You are Agent X writing a short sports-platform activity notification. Use only the facts below. Do not invent stats, scores, names, or outcomes. Keep the title under 65 characters and the body under 180 characters. Make the copy feel personal and action-oriented.\n\nPlatform: ${params.registration.platform}\nTarget URL: ${params.registration.targetUrl}\nGoal: ${params.registration.goal ?? 'General monitoring'}\nSummary counts: ${JSON.stringify(params.summary ?? {})}\nNotable changes:\n${notableLines}\n\nReturn only JSON matching this schema:\n{\n  "title": "string",\n  "body": "string"\n}`;

  const response = await llm.complete([{ role: 'user', content: prompt }], {
    tier: 'copywriting',
    temperature: 0.6,
    maxTokens: 180,
    outputSchema: {
      name: 'firecrawl_monitor_notification_copy',
      schema: notificationCopySchema,
    },
    telemetryContext: {
      operationId: params.eventKey,
      userId: params.registration.userId,
      agentId: 'strategy_coordinator',
      feature: 'firecrawl-monitor-notification',
    },
  });

  return resolveStructuredOutput(
    response,
    notificationCopySchema,
    'Firecrawl monitor notification copy'
  );
}

function buildStartupPrompt(
  registration: FirecrawlMonitorRegistrationRecord,
  notablePages: readonly NotablePageSummary[]
): string {
  const changeLines = notablePages.length
    ? notablePages.map((page) => `- ${page.status}: ${page.reason} (${page.url})`).join('\n')
    : '- Review the update and summarize what changed.';

  const openingLine = `Agent X spotted a ${registration.platform} update.`;

  return truncate(
    `${openingLine}\n\nReview the exact changes below, explain what matters, and take the best next step for me.\n\nMonitor goal: ${registration.goal ?? 'General update monitoring'}\nMonitored page: ${registration.targetUrl}\nChanges:\n${changeLines}`,
    900
  );
}

async function processSingleMonitorWebhookItem(
  db: Firestore,
  webhookType: FirecrawlMonitorWebhookPayload['type'],
  event: FirecrawlMonitorWebhookItem,
  index: number,
  deps: ResolvedMonitorNotificationDeps
): Promise<{ readonly dispatched: boolean; readonly ignored: boolean }> {
  const eventKey =
    webhookType === 'monitor.page'
      ? buildPageEventReceiptKey(event, index)
      : sanitizeKey(`firecrawl_monitor_check_completed_${event.monitorId}_${event.checkId}`);
  const eventRef = db.collection(FIRECRAWL_MONITOR_EVENT_COLLECTION).doc(eventKey);
  const existingReceipt = await eventRef.get();
  if (existingReceipt.exists) {
    return { dispatched: false, ignored: true };
  }

  const registration = await deps.monitorService.getMonitorRegistration(db, event.monitorId);
  if (!registration) {
    await eventRef.set({
      monitorId: event.monitorId,
      checkId: event.checkId,
      status: 'ignored',
      reason: 'registration_missing',
      processedAt: new Date().toISOString(),
    });
    return { dispatched: false, ignored: true };
  }

  let summary: MonitorCheckSummary | undefined;
  let notablePages: readonly NotablePageSummary[];
  let startupPromptPages: readonly NotablePageSummary[];

  if (webhookType === 'monitor.page') {
    notablePages = summarizePageEventItems([event]);
    startupPromptPages = summarizePageEventItems([event], MAX_STARTUP_PROMPT_NOTABLE_PAGES);
  } else {
    const checkEvent = event as z.infer<typeof monitorCheckCompletedEventSchema>;
    const checkDetail = await deps.monitorService.getMonitorCheck(event.monitorId, event.checkId, {
      limit: 25,
    });

    notablePages = summarizeNotablePages(checkDetail);
    startupPromptPages = summarizeNotablePages(checkDetail, MAX_STARTUP_PROMPT_NOTABLE_PAGES);
    summary = monitorCheckSummarySchema
      .optional()
      .parse(checkEvent.summary ?? checkDetail.summary ?? undefined);
  }

  await deps.monitorService.recordMonitorCheckSummaryForOwner(
    db,
    {
      ownerType: registration.ownerType,
      ownerId: registration.ownerId,
      userId: registration.userId,
    },
    registration.platform,
    {
      status: event.status,
      ...(summary ? { lastCheckSummary: summary } : {}),
    }
  );

  if (!registration.enabled || registration.status === 'paused') {
    await eventRef.set({
      userId: registration.userId,
      platform: registration.platform,
      monitorId: event.monitorId,
      checkId: event.checkId,
      status: 'ignored',
      reason: 'monitor_disabled',
      processedAt: new Date().toISOString(),
    });
    return { dispatched: false, ignored: true };
  }

  if (!hasUserVisibleChange(summary, startupPromptPages)) {
    await eventRef.set({
      userId: registration.userId,
      platform: registration.platform,
      monitorId: event.monitorId,
      checkId: event.checkId,
      status: 'ignored',
      reason: 'no_user_visible_change',
      summary: summary ?? null,
      processedAt: new Date().toISOString(),
    });
    return { dispatched: false, ignored: true };
  }

  let copy = buildNotificationFallback(registration, summary, notablePages);
  if (deps.llm) {
    try {
      copy = await generateNotificationCopy(deps.llm, {
        eventKey,
        registration,
        summary,
        notablePages,
      });
    } catch (error) {
      logger.warn('[FirecrawlMonitorWebhook] Falling back to deterministic notification copy', {
        monitorId: event.monitorId,
        checkId: event.checkId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  const startupPrompt = buildStartupPrompt(registration, startupPromptPages);
  const notificationInput: DispatchNotificationInput = {
    userId: registration.userId,
    type: NOTIFICATION_TYPES.DYNAMIC_AGENT_ALERT,
    title: copy.title,
    body: copy.body,
    deepLink: '/agent-x',
    data: {
      entityId: event.checkId,
      monitorId: event.monitorId,
      checkId: event.checkId,
      platform: registration.platform,
    },
    source: { userName: 'Agent X' },
    metadata: {
      sessionId: event.checkId,
      operationId: eventKey,
      agentId: 'strategy_coordinator',
      mode: 'firecrawl-monitor',
      resultSummary: copy.body,
      startupPrompt,
      monitorId: event.monitorId,
      checkId: event.checkId,
      platform: registration.platform,
      targetUrl: registration.targetUrl,
      lastCheckSummary: summary ?? null,
      notablePages,
    },
    priority: 'high',
    idempotencyKey: eventKey,
  };

  const dispatchResult: DispatchResult = await deps.dispatchNotification(db, notificationInput);

  await eventRef.set({
    userId: registration.userId,
    platform: registration.platform,
    monitorId: event.monitorId,
    checkId: event.checkId,
    summary: summary ?? null,
    notablePages,
    startupPrompt,
    notificationType: NOTIFICATION_TYPES.DYNAMIC_AGENT_ALERT,
    activityId: dispatchResult.activityId,
    notificationId: dispatchResult.notificationId,
    status: 'dispatched',
    processedAt: new Date().toISOString(),
  });

  return { dispatched: true, ignored: false };
}

export async function processFirecrawlMonitorWebhook(
  db: Firestore,
  payload: unknown,
  deps: MonitorNotificationDeps = {}
): Promise<ProcessFirecrawlMonitorWebhookResult> {
  const parsed = firecrawlMonitorWebhookSchema.parse(payload);

  const monitorService =
    deps.monitorService ?? new FirecrawlMonitorService(process.env['FIRECRAWL_API_KEY']);
  const llm =
    deps.llm ??
    (process.env['OPENROUTER_API_KEY'] ? new OpenRouterService({ firestore: db }) : undefined);
  const dispatchNotification = deps.dispatchNotification ?? dispatchAgentNotification;

  let processedCount = 0;
  let dispatchedCount = 0;
  let ignoredCount = 0;

  for (const [index, event] of parsed.data.entries()) {
    const result = await processSingleMonitorWebhookItem(db, parsed.type, event, index, {
      monitorService,
      llm,
      dispatchNotification,
    });
    processedCount += 1;
    if (result.dispatched) dispatchedCount += 1;
    if (result.ignored) ignoredCount += 1;
  }

  return {
    processedCount,
    dispatchedCount,
    ignoredCount,
  };
}
