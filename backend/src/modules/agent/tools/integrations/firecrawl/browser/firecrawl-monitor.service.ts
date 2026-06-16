/**
 * @fileoverview Firecrawl monitor service for user-linked monitoring state.
 *
 * Uses the Firecrawl v2 Monitoring REST API and persists a lightweight
 * per-user monitor summary plus a registry document keyed by external monitor id.
 */

import axios from 'axios';
import { getRuntimeEnvironment } from '../../../../../../config/runtime-environment.js';
import { logger } from '../../../../../../utils/logger.js';

type JsonRecord = Record<string, unknown>;

interface FirestoreDocumentSnapshotLike {
  readonly exists?: boolean;
  data(): JsonRecord | undefined;
}

interface FirestoreDocumentReferenceLike {
  get(): Promise<FirestoreDocumentSnapshotLike>;
  set(payload: unknown, options?: unknown): Promise<unknown>;
  delete(): Promise<unknown>;
}

interface FirestoreCollectionReferenceLike {
  doc(id: string): FirestoreDocumentReferenceLike;
}

export interface FirestoreLike {
  collection(name: string): FirestoreCollectionReferenceLike;
}

export interface FirecrawlMonitorSchedule {
  readonly text?: string;
  readonly cron?: string;
  readonly timezone?: string;
}

export interface FirecrawlMonitorSummary {
  readonly enabled: boolean;
  readonly monitorId: string;
  readonly targetUrl: string;
  readonly status: string;
  readonly schedule: FirecrawlMonitorSchedule;
  readonly goal?: string;
  readonly judgeEnabled?: boolean;
  readonly metadata?: JsonRecord;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly lastCheckSummary?: JsonRecord;
}

export interface CreateFirecrawlMonitorInput {
  readonly platform: string;
  readonly targetUrl: string;
  readonly schedule: FirecrawlMonitorSchedule;
  readonly goal?: string;
  readonly judgeEnabled?: boolean;
  readonly metadata?: JsonRecord;
}

export interface UpdateFirecrawlMonitorInput {
  readonly targetUrl?: string;
  readonly schedule?: FirecrawlMonitorSchedule;
  readonly goal?: string;
  readonly judgeEnabled?: boolean;
  readonly enabled?: boolean;
}

export interface FirecrawlMonitorOwner {
  readonly ownerType: 'user' | 'team';
  readonly ownerId: string;
  readonly userId: string;
}

export interface FirecrawlMonitorCheckDetail {
  readonly id: string;
  readonly monitorId: string;
  readonly status: string;
  readonly summary?: JsonRecord;
  readonly pages: readonly JsonRecord[];
}

export interface FirecrawlMonitorRegistrationRecord {
  readonly userId: string;
  readonly ownerType: 'user' | 'team';
  readonly ownerId: string;
  readonly platform: string;
  readonly monitorId: string;
  readonly targetUrl: string;
  readonly status: string;
  readonly enabled: boolean;
  readonly schedule: FirecrawlMonitorSchedule;
  readonly goal?: string;
  readonly judgeEnabled?: boolean;
  readonly metadata?: JsonRecord;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly lastCheckSummary?: JsonRecord;
}

export class FirecrawlMonitorServiceError extends Error {
  constructor(
    readonly code:
      | 'MONITOR_NOT_FOUND'
      | 'MONITOR_ALREADY_EXISTS'
      | 'MONITOR_CONFIG_MISSING'
      | 'MONITOR_API_ERROR',
    message: string,
    readonly status: number
  ) {
    super(message);
    this.name = 'FirecrawlMonitorServiceError';
  }
}

const USERS_COLLECTION = 'Users';
const TEAMS_COLLECTION = 'Teams';
const REGISTRY_COLLECTION = 'FirecrawlMonitorRegistrations';

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function cloneRecord<T>(value: T): T {
  return structuredClone(value);
}

function cleanOptionalString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

function normalizeAbsoluteHttpUrl(value: string | undefined): string | undefined {
  const trimmed = cleanOptionalString(value);
  if (!trimmed) return undefined;

  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return undefined;
    return parsed.toString();
  } catch {
    return undefined;
  }
}

function toAxiosErrorMessage(error: unknown): string {
  if (isRecord(error)) {
    const response = error['response'];
    if (isRecord(response)) {
      const data = response['data'];
      if (typeof data === 'string' && data.trim()) return data;
      if (isRecord(data)) {
        const explicitError = cleanOptionalString(data['error']);
        if (explicitError) return explicitError;
        const explicitMessage = cleanOptionalString(data['message']);
        if (explicitMessage) return explicitMessage;
      }
    }
  }

  return error instanceof Error ? error.message : 'Unknown Firecrawl API error';
}

function toMonitorStatus(resource: JsonRecord | undefined, fallback: string): string {
  const status = cleanOptionalString(resource?.['status']);
  return status ?? fallback;
}

function toMonitorEnabled(status: string, fallback: boolean): boolean {
  if (status === 'paused' || status === 'deleted') return false;
  if (status === 'active') return true;
  return fallback;
}

function toSchedule(resource: JsonRecord | undefined, fallback: FirecrawlMonitorSchedule) {
  const rawSchedule = resource?.['schedule'];
  if (!isRecord(rawSchedule)) return fallback;

  const next: FirecrawlMonitorSchedule = {
    ...(cleanOptionalString(rawSchedule['text'])
      ? { text: cleanOptionalString(rawSchedule['text']) }
      : {}),
    ...(cleanOptionalString(rawSchedule['cron'])
      ? { cron: cleanOptionalString(rawSchedule['cron']) }
      : {}),
    ...(cleanOptionalString(rawSchedule['timezone'])
      ? { timezone: cleanOptionalString(rawSchedule['timezone']) }
      : {}),
  };

  return next.text || next.cron ? next : fallback;
}

function toLastCheckSummary(resource: JsonRecord | undefined): JsonRecord | undefined {
  const lastCheckSummary = resource?.['lastCheckSummary'];
  if (isRecord(lastCheckSummary)) return cloneRecord(lastCheckSummary);

  const lastCheck = resource?.['lastCheck'];
  if (isRecord(lastCheck)) return cloneRecord(lastCheck);

  const latestCheck = resource?.['latestCheck'];
  if (isRecord(latestCheck)) return cloneRecord(latestCheck);

  return undefined;
}

function toTargetUrl(resource: JsonRecord | undefined, fallback: string): string {
  const targets = resource?.['targets'];
  if (Array.isArray(targets)) {
    for (const target of targets) {
      if (!isRecord(target)) continue;

      const urls = target['urls'];
      if (Array.isArray(urls)) {
        for (const url of urls) {
          const normalized = typeof url === 'string' ? normalizeAbsoluteHttpUrl(url) : undefined;
          if (normalized) return normalized;
        }
      }

      const crawlUrl =
        typeof target['url'] === 'string' ? normalizeAbsoluteHttpUrl(target['url']) : undefined;
      if (crawlUrl) return crawlUrl;
    }
  }

  return fallback;
}

function toMonitorResource(payload: unknown): JsonRecord | undefined {
  if (!isRecord(payload)) return undefined;

  if (isRecord(payload['data'])) return payload['data'] as JsonRecord;
  if (isRecord(payload['monitor'])) return payload['monitor'] as JsonRecord;
  return payload;
}

function sanitizeMonitorSummary(raw: unknown): FirecrawlMonitorSummary | null {
  if (!isRecord(raw)) return null;

  const monitorId = cleanOptionalString(raw['monitorId']);
  const targetUrl = cleanOptionalString(raw['targetUrl']);
  const status = cleanOptionalString(raw['status']) ?? 'active';
  const createdAt = cleanOptionalString(raw['createdAt']);
  const updatedAt = cleanOptionalString(raw['updatedAt']);

  if (!monitorId || !targetUrl || !createdAt || !updatedAt) return null;

  const rawSchedule = isRecord(raw['schedule']) ? raw['schedule'] : {};
  const schedule: FirecrawlMonitorSchedule = {
    ...(cleanOptionalString(rawSchedule['text'])
      ? { text: cleanOptionalString(rawSchedule['text']) }
      : {}),
    ...(cleanOptionalString(rawSchedule['cron'])
      ? { cron: cleanOptionalString(rawSchedule['cron']) }
      : {}),
    ...(cleanOptionalString(rawSchedule['timezone'])
      ? { timezone: cleanOptionalString(rawSchedule['timezone']) }
      : {}),
  };

  return {
    enabled: typeof raw['enabled'] === 'boolean' ? raw['enabled'] : status !== 'paused',
    monitorId,
    targetUrl,
    status,
    schedule,
    ...(cleanOptionalString(raw['goal']) ? { goal: cleanOptionalString(raw['goal']) } : {}),
    ...(typeof raw['judgeEnabled'] === 'boolean' ? { judgeEnabled: raw['judgeEnabled'] } : {}),
    ...(isRecord(raw['metadata']) ? { metadata: cloneRecord(raw['metadata']) } : {}),
    createdAt,
    updatedAt,
    ...(isRecord(raw['lastCheckSummary'])
      ? { lastCheckSummary: cloneRecord(raw['lastCheckSummary']) }
      : {}),
  };
}

function sanitizeMonitorRegistration(raw: unknown): FirecrawlMonitorRegistrationRecord | null {
  if (!isRecord(raw)) return null;

  const summary = sanitizeMonitorSummary({
    enabled: raw['enabled'],
    monitorId: raw['monitorId'],
    targetUrl: raw['targetUrl'],
    status: raw['status'],
    schedule: raw['schedule'],
    goal: raw['goal'],
    judgeEnabled: raw['judgeEnabled'],
    metadata: raw['metadata'],
    createdAt: raw['createdAt'],
    updatedAt: raw['updatedAt'],
    lastCheckSummary: raw['lastCheckSummary'],
  });
  if (!summary) return null;

  const userId = cleanOptionalString(raw['userId']);
  const ownerType = raw['ownerType'] === 'team' ? 'team' : 'user';
  const ownerId = cleanOptionalString(raw['ownerId']) ?? userId;
  const platform = cleanOptionalString(raw['platform']);
  if (!userId || !ownerId || !platform) return null;

  return {
    userId,
    ownerType,
    ownerId,
    platform,
    ...summary,
  };
}

export class FirecrawlMonitorService {
  private readonly apiKey: string;
  private readonly apiBaseUrl: string;
  private readonly backendBaseUrl?: string;
  private readonly webhookSecret?: string;

  constructor(
    apiKey?: string,
    apiBaseUrl?: string,
    backendBaseUrl?: string,
    webhookSecret?: string
  ) {
    const resolvedApiKey = cleanOptionalString(apiKey ?? process.env['FIRECRAWL_API_KEY']);
    if (!resolvedApiKey) {
      throw new FirecrawlMonitorServiceError(
        'MONITOR_CONFIG_MISSING',
        'FIRECRAWL_API_KEY is required for Firecrawl monitoring.',
        500
      );
    }

    this.apiKey = resolvedApiKey;
    this.apiBaseUrl = (
      apiBaseUrl ??
      process.env['FIRECRAWL_API_BASE_URL'] ??
      'https://api.firecrawl.dev'
    ).replace(/\/$/, '');
    this.backendBaseUrl =
      (backendBaseUrl ?? process.env['BACKEND_URL'])?.replace(/\/$/, '') || undefined;
    this.webhookSecret = cleanOptionalString(
      webhookSecret ?? process.env['FIRECRAWL_MONITOR_WEBHOOK_SECRET']
    );
  }

  async listMonitors(
    db: FirestoreLike,
    userId: string
  ): Promise<Record<string, FirecrawlMonitorSummary>> {
    return this.listMonitorsForOwner(db, {
      ownerType: 'user',
      ownerId: userId,
      userId,
    });
  }

  async listMonitorsForOwner(
    db: FirestoreLike,
    owner: FirecrawlMonitorOwner
  ): Promise<Record<string, FirecrawlMonitorSummary>> {
    const { connectedAccounts } = await this.getOwnerDocument(db, owner);
    const monitors: Record<string, FirecrawlMonitorSummary> = {};

    for (const [platform, accountValue] of Object.entries(connectedAccounts)) {
      const account = isRecord(accountValue) ? accountValue : null;
      const summary = sanitizeMonitorSummary(account?.['monitor']);
      if (summary) monitors[platform] = summary;
    }

    return monitors;
  }

  async getMonitor(
    db: FirestoreLike,
    userId: string,
    platform: string
  ): Promise<FirecrawlMonitorSummary | null> {
    return this.getMonitorForOwner(
      db,
      {
        ownerType: 'user',
        ownerId: userId,
        userId,
      },
      platform
    );
  }

  async getMonitorForOwner(
    db: FirestoreLike,
    owner: FirecrawlMonitorOwner,
    platform: string
  ): Promise<FirecrawlMonitorSummary | null> {
    const monitors = await this.listMonitorsForOwner(db, owner);
    return monitors[platform] ?? null;
  }

  async getMonitorRegistration(
    db: FirestoreLike,
    monitorId: string
  ): Promise<FirecrawlMonitorRegistrationRecord | null> {
    const snapshot = await db.collection(REGISTRY_COLLECTION).doc(monitorId).get();
    return sanitizeMonitorRegistration(snapshot.data());
  }

  async createMonitor(
    db: FirestoreLike,
    userId: string,
    input: CreateFirecrawlMonitorInput
  ): Promise<FirecrawlMonitorSummary> {
    return this.createMonitorForOwner(
      db,
      {
        ownerType: 'user',
        ownerId: userId,
        userId,
      },
      input
    );
  }

  async createMonitorForOwner(
    db: FirestoreLike,
    owner: FirecrawlMonitorOwner,
    input: CreateFirecrawlMonitorInput
  ): Promise<FirecrawlMonitorSummary> {
    const existing = await this.getMonitorForOwner(db, owner, input.platform);
    if (existing) {
      throw new FirecrawlMonitorServiceError(
        'MONITOR_ALREADY_EXISTS',
        `A Firecrawl monitor already exists for ${input.platform}.`,
        409
      );
    }

    const payload: JsonRecord = {
      name: `NXT1 ${input.platform} monitor`,
      schedule: input.schedule,
      targets: [
        {
          type: 'scrape',
          urls: [input.targetUrl],
        },
      ],
      ...(input.goal ? { goal: input.goal } : {}),
      ...(typeof input.judgeEnabled === 'boolean' ? { judgeEnabled: input.judgeEnabled } : {}),
    };

    const webhook = this.buildWebhookConfig(owner, input.platform);
    if (webhook) payload['webhook'] = webhook;

    logger.info('[FirecrawlMonitor] Creating monitor', {
      userId: owner.userId,
      ownerType: owner.ownerType,
      ownerId: owner.ownerId,
      platform: input.platform,
      targetUrl: input.targetUrl,
    });

    let responseData: unknown;
    try {
      const response = await axios.post(this.buildMonitorEndpoint(), payload, {
        headers: this.buildHeaders(),
      });
      responseData = response.data;
    } catch (error) {
      throw new FirecrawlMonitorServiceError(
        'MONITOR_API_ERROR',
        `Failed to create Firecrawl monitor: ${toAxiosErrorMessage(error)}`,
        502
      );
    }

    const resource = toMonitorResource(responseData);
    const monitorId =
      cleanOptionalString(resource?.['id']) ?? cleanOptionalString(resource?.['monitorId']);
    if (!monitorId) {
      throw new FirecrawlMonitorServiceError(
        'MONITOR_API_ERROR',
        'Firecrawl monitor create response did not include a monitor id.',
        502
      );
    }

    const now = new Date().toISOString();
    const status = toMonitorStatus(resource, 'active');
    const summary: FirecrawlMonitorSummary = {
      enabled: toMonitorEnabled(status, true),
      monitorId,
      targetUrl: toTargetUrl(resource, input.targetUrl),
      status,
      schedule: toSchedule(resource, input.schedule),
      ...((cleanOptionalString(resource?.['goal']) ?? input.goal)
        ? { goal: cleanOptionalString(resource?.['goal']) ?? input.goal }
        : {}),
      ...(typeof resource?.['judgeEnabled'] === 'boolean'
        ? { judgeEnabled: resource['judgeEnabled'] as boolean }
        : typeof input.judgeEnabled === 'boolean'
          ? { judgeEnabled: input.judgeEnabled }
          : {}),
      ...(input.metadata ? { metadata: cloneRecord(input.metadata) } : {}),
      createdAt: cleanOptionalString(resource?.['createdAt']) ?? now,
      updatedAt: cleanOptionalString(resource?.['updatedAt']) ?? now,
      ...(toLastCheckSummary(resource) ? { lastCheckSummary: toLastCheckSummary(resource) } : {}),
    };

    await this.persistMonitorSummary(db, owner, input.platform, summary);

    logger.info('[FirecrawlMonitor] Monitor created', {
      userId: owner.userId,
      ownerType: owner.ownerType,
      ownerId: owner.ownerId,
      platform: input.platform,
      monitorId,
    });

    return summary;
  }

  async updateMonitor(
    db: FirestoreLike,
    userId: string,
    platform: string,
    input: UpdateFirecrawlMonitorInput
  ): Promise<FirecrawlMonitorSummary> {
    return this.updateMonitorForOwner(
      db,
      {
        ownerType: 'user',
        ownerId: userId,
        userId,
      },
      platform,
      input
    );
  }

  async updateMonitorForOwner(
    db: FirestoreLike,
    owner: FirecrawlMonitorOwner,
    platform: string,
    input: UpdateFirecrawlMonitorInput
  ): Promise<FirecrawlMonitorSummary> {
    const existing = await this.getMonitorForOwner(db, owner, platform);
    if (!existing) {
      throw new FirecrawlMonitorServiceError(
        'MONITOR_NOT_FOUND',
        `No Firecrawl monitor exists for ${platform}.`,
        404
      );
    }

    const payload: JsonRecord = {
      ...(input.targetUrl
        ? {
            targets: [
              {
                type: 'scrape',
                urls: [input.targetUrl],
              },
            ],
          }
        : {}),
      ...(input.schedule ? { schedule: input.schedule } : {}),
      ...(input.goal ? { goal: input.goal } : {}),
      ...(typeof input.judgeEnabled === 'boolean' ? { judgeEnabled: input.judgeEnabled } : {}),
      ...(typeof input.enabled === 'boolean'
        ? { status: input.enabled ? 'active' : 'paused' }
        : {}),
    };

    logger.info('[FirecrawlMonitor] Updating monitor', {
      userId: owner.userId,
      ownerType: owner.ownerType,
      ownerId: owner.ownerId,
      platform,
      monitorId: existing.monitorId,
    });

    let responseData: unknown;
    try {
      const response = await axios.patch(this.buildMonitorEndpoint(existing.monitorId), payload, {
        headers: this.buildHeaders(),
      });
      responseData = response.data;
    } catch (error) {
      throw new FirecrawlMonitorServiceError(
        'MONITOR_API_ERROR',
        `Failed to update Firecrawl monitor: ${toAxiosErrorMessage(error)}`,
        502
      );
    }

    const resource = toMonitorResource(responseData);
    const now = new Date().toISOString();
    const status = toMonitorStatus(
      resource,
      typeof input.enabled === 'boolean' ? (input.enabled ? 'active' : 'paused') : existing.status
    );

    const summary: FirecrawlMonitorSummary = {
      ...existing,
      enabled: toMonitorEnabled(
        status,
        typeof input.enabled === 'boolean' ? input.enabled : existing.enabled
      ),
      targetUrl: toTargetUrl(resource, input.targetUrl ?? existing.targetUrl),
      status,
      schedule: toSchedule(resource, input.schedule ?? existing.schedule),
      ...((cleanOptionalString(resource?.['goal']) ?? input.goal ?? existing.goal)
        ? { goal: cleanOptionalString(resource?.['goal']) ?? input.goal ?? existing.goal }
        : {}),
      ...(typeof resource?.['judgeEnabled'] === 'boolean'
        ? { judgeEnabled: resource['judgeEnabled'] as boolean }
        : typeof input.judgeEnabled === 'boolean'
          ? { judgeEnabled: input.judgeEnabled }
          : existing.judgeEnabled !== undefined
            ? { judgeEnabled: existing.judgeEnabled }
            : {}),
      ...(existing.metadata ? { metadata: cloneRecord(existing.metadata) } : {}),
      updatedAt: cleanOptionalString(resource?.['updatedAt']) ?? now,
      ...(toLastCheckSummary(resource)
        ? { lastCheckSummary: toLastCheckSummary(resource) }
        : existing.lastCheckSummary
          ? { lastCheckSummary: cloneRecord(existing.lastCheckSummary) }
          : {}),
    };

    await this.persistMonitorSummary(db, owner, platform, summary);

    logger.info('[FirecrawlMonitor] Monitor updated', {
      userId: owner.userId,
      ownerType: owner.ownerType,
      ownerId: owner.ownerId,
      platform,
      monitorId: existing.monitorId,
      status: summary.status,
    });

    return summary;
  }

  async deleteMonitor(
    db: FirestoreLike,
    userId: string,
    platform: string
  ): Promise<FirecrawlMonitorSummary> {
    return this.deleteMonitorForOwner(
      db,
      {
        ownerType: 'user',
        ownerId: userId,
        userId,
      },
      platform
    );
  }

  async deleteMonitorForOwner(
    db: FirestoreLike,
    owner: FirecrawlMonitorOwner,
    platform: string
  ): Promise<FirecrawlMonitorSummary> {
    const existing = await this.getMonitorForOwner(db, owner, platform);
    if (!existing) {
      throw new FirecrawlMonitorServiceError(
        'MONITOR_NOT_FOUND',
        `No Firecrawl monitor exists for ${platform}.`,
        404
      );
    }

    logger.info('[FirecrawlMonitor] Deleting monitor', {
      userId: owner.userId,
      ownerType: owner.ownerType,
      ownerId: owner.ownerId,
      platform,
      monitorId: existing.monitorId,
    });

    try {
      await axios.delete(this.buildMonitorEndpoint(existing.monitorId), {
        headers: this.buildHeaders(),
      });
    } catch (error) {
      throw new FirecrawlMonitorServiceError(
        'MONITOR_API_ERROR',
        `Failed to delete Firecrawl monitor: ${toAxiosErrorMessage(error)}`,
        502
      );
    }

    const { ownerData, connectedAccounts, ownerRef } = await this.getOwnerDocument(db, owner);
    const nextConnectedAccounts = cloneRecord(connectedAccounts);
    const account = isRecord(nextConnectedAccounts[platform])
      ? cloneRecord(nextConnectedAccounts[platform] as JsonRecord)
      : undefined;

    if (account) {
      delete account['monitor'];
      if (Object.keys(account).length > 0) {
        nextConnectedAccounts[platform] = account;
      } else {
        delete nextConnectedAccounts[platform];
      }
    }

    await ownerRef.set({
      ...ownerData,
      connectedAccounts: nextConnectedAccounts,
    });

    await db.collection(REGISTRY_COLLECTION).doc(existing.monitorId).delete();

    logger.info('[FirecrawlMonitor] Monitor deleted', {
      userId: owner.userId,
      ownerType: owner.ownerType,
      ownerId: owner.ownerId,
      platform,
      monitorId: existing.monitorId,
    });

    return existing;
  }

  async getMonitorCheck(
    monitorId: string,
    checkId: string,
    options?: {
      readonly limit?: number;
      readonly pageStatus?: 'same' | 'new' | 'changed' | 'removed' | 'error';
    }
  ): Promise<FirecrawlMonitorCheckDetail> {
    let responseData: unknown;
    try {
      const response = await axios.get(this.buildMonitorCheckEndpoint(monitorId, checkId), {
        headers: this.buildHeaders(),
        params: {
          ...(typeof options?.limit === 'number' ? { limit: options.limit } : {}),
          ...(options?.pageStatus ? { status: options.pageStatus } : {}),
        },
      });
      responseData = response.data;
    } catch (error) {
      throw new FirecrawlMonitorServiceError(
        'MONITOR_API_ERROR',
        `Failed to fetch Firecrawl monitor check: ${toAxiosErrorMessage(error)}`,
        502
      );
    }

    const resource = toMonitorResource(responseData);
    const resolvedId = cleanOptionalString(resource?.['id']);
    const resolvedMonitorId = cleanOptionalString(resource?.['monitorId']);
    const resolvedStatus = cleanOptionalString(resource?.['status']);
    const rawPages = Array.isArray(resource?.['pages'])
      ? (resource?.['pages'] as unknown[]).filter(isRecord).map((page) => cloneRecord(page))
      : [];

    if (!resolvedId || !resolvedMonitorId || !resolvedStatus) {
      throw new FirecrawlMonitorServiceError(
        'MONITOR_API_ERROR',
        'Firecrawl monitor check response was missing required fields.',
        502
      );
    }

    return {
      id: resolvedId,
      monitorId: resolvedMonitorId,
      status: resolvedStatus,
      ...(isRecord(resource?.['summary'])
        ? { summary: cloneRecord(resource?.['summary'] as JsonRecord) }
        : {}),
      pages: rawPages,
    };
  }

  async recordMonitorCheckSummary(
    db: FirestoreLike,
    userId: string,
    platform: string,
    update: {
      readonly status?: string;
      readonly lastCheckSummary?: JsonRecord;
      readonly updatedAt?: string;
    }
  ): Promise<FirecrawlMonitorSummary | null> {
    return this.recordMonitorCheckSummaryForOwner(
      db,
      {
        ownerType: 'user',
        ownerId: userId,
        userId,
      },
      platform,
      update
    );
  }

  async recordMonitorCheckSummaryForOwner(
    db: FirestoreLike,
    owner: FirecrawlMonitorOwner,
    platform: string,
    update: {
      readonly status?: string;
      readonly lastCheckSummary?: JsonRecord;
      readonly updatedAt?: string;
    }
  ): Promise<FirecrawlMonitorSummary | null> {
    const existing = await this.getMonitorForOwner(db, owner, platform);
    if (!existing) {
      return null;
    }

    const nextSummary: FirecrawlMonitorSummary = {
      ...existing,
      ...(update.status
        ? { status: update.status, enabled: toMonitorEnabled(update.status, existing.enabled) }
        : {}),
      ...(update.lastCheckSummary
        ? { lastCheckSummary: cloneRecord(update.lastCheckSummary) }
        : {}),
      updatedAt: update.updatedAt ?? new Date().toISOString(),
    };

    await this.persistMonitorSummary(db, owner, platform, nextSummary);
    return nextSummary;
  }

  private buildHeaders(): Record<string, string> {
    return {
      Authorization: `Bearer ${this.apiKey}`,
      'Content-Type': 'application/json',
    };
  }

  private buildMonitorEndpoint(monitorId?: string): string {
    const path = monitorId ? `/v2/monitor/${encodeURIComponent(monitorId)}` : '/v2/monitor';
    return new URL(path, this.apiBaseUrl).toString();
  }

  private buildMonitorCheckEndpoint(monitorId: string, checkId: string): string {
    return new URL(
      `/v2/monitor/${encodeURIComponent(monitorId)}/checks/${encodeURIComponent(checkId)}`,
      this.apiBaseUrl
    ).toString();
  }

  private buildWebhookConfig(
    owner: FirecrawlMonitorOwner,
    platform: string
  ): JsonRecord | undefined {
    const baseUrl = normalizeAbsoluteHttpUrl(this.backendBaseUrl);
    if (!baseUrl) return undefined;

    const apiPrefix = getRuntimeEnvironment() === 'production' ? '/api/v1' : '/api/v1/staging';
    const webhook: JsonRecord = {
      url: `${baseUrl.replace(/\/$/, '')}${apiPrefix}/firecrawl-monitor-webhook`,
      metadata: {
        userId: owner.userId,
        ownerType: owner.ownerType,
        ownerId: owner.ownerId,
        platform,
      },
    };

    if (this.webhookSecret) {
      webhook['headers'] = {
        'x-firecrawl-monitor-secret': this.webhookSecret,
      };
    }

    return webhook;
  }

  private async getOwnerDocument(
    db: FirestoreLike,
    owner: FirecrawlMonitorOwner
  ): Promise<{
    ownerRef: FirestoreDocumentReferenceLike;
    ownerData: JsonRecord;
    connectedAccounts: JsonRecord;
  }> {
    const collectionName = owner.ownerType === 'team' ? TEAMS_COLLECTION : USERS_COLLECTION;
    const ownerRef = db.collection(collectionName).doc(owner.ownerId);
    const snapshot = await ownerRef.get();
    const rawData = snapshot.data() ?? {};
    const ownerData = isRecord(rawData) ? cloneRecord(rawData) : {};
    const connectedAccounts = isRecord(ownerData['connectedAccounts'])
      ? cloneRecord(ownerData['connectedAccounts'] as JsonRecord)
      : {};

    return {
      ownerRef,
      ownerData,
      connectedAccounts,
    };
  }

  private async persistMonitorSummary(
    db: FirestoreLike,
    owner: FirecrawlMonitorOwner,
    platform: string,
    summary: FirecrawlMonitorSummary
  ): Promise<void> {
    const { ownerData, connectedAccounts, ownerRef } = await this.getOwnerDocument(db, owner);
    const nextConnectedAccounts = cloneRecord(connectedAccounts);
    const currentAccount = isRecord(nextConnectedAccounts[platform])
      ? cloneRecord(nextConnectedAccounts[platform] as JsonRecord)
      : {};

    currentAccount['monitor'] = cloneRecord(summary);
    nextConnectedAccounts[platform] = currentAccount;

    await ownerRef.set({
      ...ownerData,
      connectedAccounts: nextConnectedAccounts,
    });

    await db
      .collection(REGISTRY_COLLECTION)
      .doc(summary.monitorId)
      .set({
        userId: owner.userId,
        ownerType: owner.ownerType,
        ownerId: owner.ownerId,
        platform,
        monitorId: summary.monitorId,
        targetUrl: summary.targetUrl,
        status: summary.status,
        enabled: summary.enabled,
        schedule: cloneRecord(summary.schedule),
        ...(summary.goal ? { goal: summary.goal } : {}),
        ...(typeof summary.judgeEnabled === 'boolean'
          ? { judgeEnabled: summary.judgeEnabled }
          : {}),
        ...(summary.metadata ? { metadata: cloneRecord(summary.metadata) } : {}),
        createdAt: summary.createdAt,
        updatedAt: summary.updatedAt,
        ...(summary.lastCheckSummary
          ? { lastCheckSummary: cloneRecord(summary.lastCheckSummary) }
          : {}),
      });
  }
}
