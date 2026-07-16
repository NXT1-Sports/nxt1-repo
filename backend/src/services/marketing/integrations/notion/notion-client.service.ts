/**
 * @fileoverview Notion REST Client Service
 * @module @nxt1/backend/services/marketing/integrations/notion/client
 */

import type { RuntimeEnvironment } from '../../../../config/runtime-environment.js';

const DEFAULT_NOTION_API_BASE_URL = 'https://api.notion.com/v1';
const DEFAULT_NOTION_API_VERSION = '2022-06-28';
const DEFAULT_NOTION_TIMEOUT_MS = 3_500;
const RETRYABLE_NOTION_STATUS_CODES = new Set([408, 409, 429, 500, 502, 503, 504]);

export interface NotionSignupDashboardConfig {
  readonly enabled: boolean;
  readonly apiToken?: string;
  readonly databaseId?: string;
  readonly apiBaseUrl: string;
  readonly apiVersion: string;
  readonly timeoutMs: number;
  readonly maxAttempts: number;
  readonly batchLimit: number;
}

export interface NotionPageSummary {
  readonly id: string;
  readonly url?: string;
}

export interface NotionRichTextText {
  readonly content: string;
}

export interface NotionRichTextFragment {
  readonly type: 'text';
  readonly text: NotionRichTextText;
}

export type NotionPropertyValue =
  | { readonly title: readonly NotionRichTextFragment[] }
  | { readonly rich_text: readonly NotionRichTextFragment[] }
  | { readonly email: string | null }
  | { readonly phone_number: string | null }
  | { readonly number: number | null }
  | { readonly checkbox: boolean }
  | { readonly select: { readonly name: string } | null }
  | { readonly status: { readonly name: string } | null }
  | { readonly date: { readonly start: string } | null }
  | { readonly relation: readonly { readonly id: string }[] }
  | { readonly url: string | null };

export type NotionProperties = Record<string, NotionPropertyValue>;

export interface NotionPagePropertyRecord {
  readonly type?: string;
  readonly number?: number | null;
  readonly checkbox?: boolean | null;
  readonly status?: { readonly name?: string } | null;
  readonly select?: { readonly name?: string } | null;
  readonly relation?: readonly { readonly id?: string }[] | null;
}

export interface NotionPageRecord extends NotionPageSummary {
  readonly properties?: Record<string, NotionPagePropertyRecord>;
}

export type NotionQueryFilter =
  | {
      readonly property: string;
      readonly rich_text: {
        readonly equals: string;
      };
    }
  | {
      readonly property: string;
      readonly email: {
        readonly equals: string;
      };
    }
  | {
      readonly property: string;
      readonly title: {
        readonly equals?: string;
        readonly starts_with?: string;
      };
    }
  | {
      readonly property: string;
      readonly date: {
        readonly equals: string;
      };
    }
  | {
      readonly property: string;
      readonly checkbox: {
        readonly equals: boolean;
      };
    };

export interface NotionQueryDatabaseInput {
  readonly config: NotionSignupDashboardConfig;
  readonly filter: NotionQueryFilter;
  readonly pageSize?: number;
}

interface NotionQueryDatabaseResponse {
  readonly results?: readonly NotionPageSummary[];
}

interface NotionCreatePageResponse {
  readonly id?: string;
  readonly url?: string;
}

interface NotionUpdatePageResponse {
  readonly id?: string;
  readonly url?: string;
}

interface NotionRetrievePageResponse {
  readonly id?: string;
  readonly url?: string;
  readonly properties?: Record<string, NotionPagePropertyRecord>;
}

export class NotionIntegrationError extends Error {
  constructor(
    message: string,
    readonly retryable: boolean,
    readonly statusCode?: number
  ) {
    super(message);
    this.name = 'NotionIntegrationError';
  }
}

function parsePositiveInteger(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function getEnvironmentDatabaseId(environment: RuntimeEnvironment): string | undefined {
  const environmentSpecific =
    environment === 'production'
      ? process.env['PRODUCTION_NOTION_SIGNUP_DASHBOARD_DATABASE_ID']
      : process.env['STAGING_NOTION_SIGNUP_DASHBOARD_DATABASE_ID'];

  return environmentSpecific?.trim() || process.env['NOTION_SIGNUP_DASHBOARD_DATABASE_ID']?.trim();
}

function getEnvironmentWeeklyKpisDatabaseId(environment: RuntimeEnvironment): string | undefined {
  const environmentSpecific =
    environment === 'production'
      ? process.env['PRODUCTION_NOTION_WEEKLY_KPIS_DATABASE_ID']
      : process.env['STAGING_NOTION_WEEKLY_KPIS_DATABASE_ID'];

  return environmentSpecific?.trim() || process.env['NOTION_WEEKLY_KPIS_DATABASE_ID']?.trim();
}

function getEnvironmentB2CUsersDatabaseId(environment: RuntimeEnvironment): string | undefined {
  const environmentSpecific =
    environment === 'production'
      ? (process.env['PRODUCTION_NOTION_B2C_USERS_DATABASE_ID'] ??
        process.env['PRODUCTION_NOTION_B2C_GROWTH_HUB_DATABASE_ID'])
      : (process.env['STAGING_NOTION_B2C_USERS_DATABASE_ID'] ??
        process.env['STAGING_NOTION_B2C_GROWTH_HUB_DATABASE_ID']);

  return (
    environmentSpecific?.trim() ||
    process.env['NOTION_B2C_USERS_DATABASE_ID']?.trim() ||
    process.env['NOTION_B2C_GROWTH_HUB_DATABASE_ID']?.trim()
  );
}

function getEnvironmentMonthlyScoreboardDatabaseId(
  environment: RuntimeEnvironment
): string | undefined {
  const environmentSpecific =
    environment === 'production'
      ? process.env['PRODUCTION_NOTION_MONTHLY_SCOREBOARD_DATABASE_ID']
      : process.env['STAGING_NOTION_MONTHLY_SCOREBOARD_DATABASE_ID'];

  return (
    environmentSpecific?.trim() || process.env['NOTION_MONTHLY_SCOREBOARD_DATABASE_ID']?.trim()
  );
}

function getEnvironmentInvestorsPartnershipsDatabaseId(
  environment: RuntimeEnvironment
): string | undefined {
  const environmentSpecific =
    environment === 'production'
      ? process.env['PRODUCTION_NOTION_INVESTORS_PARTNERSHIPS_DATABASE_ID']
      : process.env['STAGING_NOTION_INVESTORS_PARTNERSHIPS_DATABASE_ID'];

  return (
    environmentSpecific?.trim() || process.env['NOTION_INVESTORS_PARTNERSHIPS_DATABASE_ID']?.trim()
  );
}

export function getNotionSignupDashboardConfig(
  environment: RuntimeEnvironment
): NotionSignupDashboardConfig {
  const enabled = process.env['NOTION_SIGNUP_DASHBOARD_ENABLED'] === 'true';

  return {
    enabled,
    apiToken: process.env['NOTION_API_TOKEN']?.trim() || undefined,
    databaseId: getEnvironmentDatabaseId(environment),
    apiBaseUrl: process.env['NOTION_API_BASE_URL']?.trim() || DEFAULT_NOTION_API_BASE_URL,
    apiVersion: process.env['NOTION_API_VERSION']?.trim() || DEFAULT_NOTION_API_VERSION,
    timeoutMs: parsePositiveInteger(
      process.env['NOTION_SIGNUP_DASHBOARD_TIMEOUT_MS'],
      DEFAULT_NOTION_TIMEOUT_MS
    ),
    maxAttempts: parsePositiveInteger(process.env['NOTION_SIGNUP_DASHBOARD_MAX_ATTEMPTS'], 5),
    batchLimit: parsePositiveInteger(process.env['NOTION_SIGNUP_DASHBOARD_BATCH_LIMIT'], 50),
  };
}

export function getNotionWeeklyKpisConfig(
  environment: RuntimeEnvironment
): NotionSignupDashboardConfig {
  const enabled = process.env['NOTION_WEEKLY_KPIS_ENABLED'] === 'true';

  return {
    enabled,
    apiToken: process.env['NOTION_API_TOKEN']?.trim() || undefined,
    databaseId: getEnvironmentWeeklyKpisDatabaseId(environment),
    apiBaseUrl: process.env['NOTION_API_BASE_URL']?.trim() || DEFAULT_NOTION_API_BASE_URL,
    apiVersion: process.env['NOTION_API_VERSION']?.trim() || DEFAULT_NOTION_API_VERSION,
    timeoutMs: parsePositiveInteger(
      process.env['NOTION_WEEKLY_KPIS_TIMEOUT_MS'],
      DEFAULT_NOTION_TIMEOUT_MS
    ),
    maxAttempts: parsePositiveInteger(process.env['NOTION_WEEKLY_KPIS_MAX_ATTEMPTS'], 5),
    batchLimit: parsePositiveInteger(process.env['NOTION_WEEKLY_KPIS_BATCH_LIMIT'], 50),
  };
}

export function getNotionB2CUsersConfig(
  environment: RuntimeEnvironment
): NotionSignupDashboardConfig {
  const databaseId = getEnvironmentB2CUsersDatabaseId(environment);
  const enabledSetting =
    process.env['NOTION_B2C_USERS_ENABLED']?.trim().toLowerCase() ??
    process.env['NOTION_B2C_GROWTH_HUB_ENABLED']?.trim().toLowerCase();
  const enabled =
    enabledSetting === 'true' ||
    (enabledSetting !== 'false' && Boolean(process.env['NOTION_API_TOKEN']?.trim() && databaseId));

  return {
    enabled,
    apiToken: process.env['NOTION_API_TOKEN']?.trim() || undefined,
    databaseId,
    apiBaseUrl: process.env['NOTION_API_BASE_URL']?.trim() || DEFAULT_NOTION_API_BASE_URL,
    apiVersion: process.env['NOTION_API_VERSION']?.trim() || DEFAULT_NOTION_API_VERSION,
    timeoutMs: parsePositiveInteger(
      process.env['NOTION_B2C_USERS_TIMEOUT_MS'] ?? process.env['NOTION_B2C_GROWTH_HUB_TIMEOUT_MS'],
      DEFAULT_NOTION_TIMEOUT_MS
    ),
    maxAttempts: parsePositiveInteger(
      process.env['NOTION_B2C_USERS_MAX_ATTEMPTS'] ??
        process.env['NOTION_B2C_GROWTH_HUB_MAX_ATTEMPTS'],
      5
    ),
    batchLimit: parsePositiveInteger(
      process.env['NOTION_B2C_USERS_BATCH_LIMIT'] ??
        process.env['NOTION_B2C_GROWTH_HUB_BATCH_LIMIT'],
      50
    ),
  };
}

export function getNotionMonthlyScoreboardConfig(
  environment: RuntimeEnvironment
): NotionSignupDashboardConfig {
  const enabled = process.env['NOTION_MONTHLY_SCOREBOARD_ENABLED'] === 'true';

  return {
    enabled,
    apiToken: process.env['NOTION_API_TOKEN']?.trim() || undefined,
    databaseId: getEnvironmentMonthlyScoreboardDatabaseId(environment),
    apiBaseUrl: process.env['NOTION_API_BASE_URL']?.trim() || DEFAULT_NOTION_API_BASE_URL,
    apiVersion: process.env['NOTION_API_VERSION']?.trim() || DEFAULT_NOTION_API_VERSION,
    timeoutMs: parsePositiveInteger(
      process.env['NOTION_MONTHLY_SCOREBOARD_TIMEOUT_MS'],
      DEFAULT_NOTION_TIMEOUT_MS
    ),
    maxAttempts: parsePositiveInteger(process.env['NOTION_MONTHLY_SCOREBOARD_MAX_ATTEMPTS'], 5),
    batchLimit: parsePositiveInteger(process.env['NOTION_MONTHLY_SCOREBOARD_BATCH_LIMIT'], 50),
  };
}

export function getNotionInvestorsPartnershipsConfig(
  environment: RuntimeEnvironment
): NotionSignupDashboardConfig {
  const databaseId = getEnvironmentInvestorsPartnershipsDatabaseId(environment);
  const enabledSetting = process.env['NOTION_INVESTORS_PARTNERSHIPS_ENABLED']?.trim().toLowerCase();
  const enabled =
    enabledSetting === 'true' ||
    (enabledSetting !== 'false' && Boolean(process.env['NOTION_API_TOKEN']?.trim() && databaseId));

  return {
    enabled,
    apiToken: process.env['NOTION_API_TOKEN']?.trim() || undefined,
    databaseId,
    apiBaseUrl: process.env['NOTION_API_BASE_URL']?.trim() || DEFAULT_NOTION_API_BASE_URL,
    apiVersion: process.env['NOTION_API_VERSION']?.trim() || DEFAULT_NOTION_API_VERSION,
    timeoutMs: parsePositiveInteger(
      process.env['NOTION_INVESTORS_PARTNERSHIPS_TIMEOUT_MS'],
      DEFAULT_NOTION_TIMEOUT_MS
    ),
    maxAttempts: parsePositiveInteger(process.env['NOTION_INVESTORS_PARTNERSHIPS_MAX_ATTEMPTS'], 5),
    batchLimit: parsePositiveInteger(process.env['NOTION_INVESTORS_PARTNERSHIPS_BATCH_LIMIT'], 50),
  };
}

export function getNotionSignupDashboardDisabledReason(
  config: NotionSignupDashboardConfig
): 'disabled' | 'missing-token' | 'missing-database-id' | null {
  if (!config.enabled) return 'disabled';
  if (!config.apiToken) return 'missing-token';
  if (!config.databaseId) return 'missing-database-id';
  return null;
}

function buildNotionHeaders(config: NotionSignupDashboardConfig): HeadersInit {
  if (!config.apiToken) {
    throw new NotionIntegrationError('Notion API token is not configured', false);
  }

  return {
    Authorization: `Bearer ${config.apiToken}`,
    'Content-Type': 'application/json',
    'Notion-Version': config.apiVersion,
  };
}

async function parseNotionErrorBody(response: Response): Promise<string> {
  const body = await response.text().catch(() => '');
  if (!body) return `HTTP ${response.status}`;
  return body.slice(0, 500);
}

async function notionRequest<T>(
  config: NotionSignupDashboardConfig,
  path: string,
  init: RequestInit
): Promise<T> {
  try {
    const response = await fetch(`${config.apiBaseUrl}${path}`, {
      ...init,
      headers: buildNotionHeaders(config),
      signal: AbortSignal.timeout(config.timeoutMs),
    });

    if (!response.ok) {
      const details = await parseNotionErrorBody(response);
      throw new NotionIntegrationError(
        `Notion request failed: ${details}`,
        RETRYABLE_NOTION_STATUS_CODES.has(response.status),
        response.status
      );
    }

    return (await response.json()) as T;
  } catch (error) {
    if (error instanceof NotionIntegrationError) {
      throw error;
    }

    const normalized = error instanceof Error ? error : new Error(String(error));
    const retryable =
      normalized.name === 'TimeoutError' ||
      normalized.name === 'AbortError' ||
      normalized instanceof TypeError;
    throw new NotionIntegrationError(`Notion request failed: ${normalized.message}`, retryable);
  }
}

export async function queryNotionDatabasePages(
  input: NotionQueryDatabaseInput
): Promise<readonly NotionPageSummary[]> {
  if (!input.config.databaseId) {
    throw new NotionIntegrationError(
      'Notion signup dashboard database id is not configured',
      false
    );
  }

  const response = await notionRequest<NotionQueryDatabaseResponse>(
    input.config,
    `/databases/${input.config.databaseId}/query`,
    {
      method: 'POST',
      body: JSON.stringify({ filter: input.filter, page_size: input.pageSize ?? 1 }),
    }
  );

  return response.results ?? [];
}

export async function queryNotionDatabase(
  input: NotionQueryDatabaseInput
): Promise<NotionPageSummary | null> {
  const results = await queryNotionDatabasePages({
    ...input,
    pageSize: 1,
  });

  return results[0] ?? null;
}

export async function queryNotionDatabaseByEmail(input: {
  readonly config: NotionSignupDashboardConfig;
  readonly property: string;
  readonly email: string;
}): Promise<NotionPageSummary | null> {
  return queryNotionDatabase({
    config: input.config,
    filter: {
      property: input.property,
      email: { equals: input.email },
    },
  });
}

export async function createNotionSignupDashboardPage(input: {
  readonly config: NotionSignupDashboardConfig;
  readonly properties: NotionProperties;
}): Promise<NotionPageSummary> {
  if (!input.config.databaseId) {
    throw new NotionIntegrationError(
      'Notion signup dashboard database id is not configured',
      false
    );
  }

  const response = await notionRequest<NotionCreatePageResponse>(input.config, '/pages', {
    method: 'POST',
    body: JSON.stringify({
      parent: { database_id: input.config.databaseId },
      properties: input.properties,
    }),
  });

  if (!response.id) {
    throw new NotionIntegrationError('Notion page create response did not include a page id', true);
  }

  return { id: response.id, url: response.url };
}

export async function updateNotionSignupDashboardPage(input: {
  readonly config: NotionSignupDashboardConfig;
  readonly pageId: string;
  readonly properties: NotionProperties;
}): Promise<NotionPageSummary> {
  const response = await notionRequest<NotionUpdatePageResponse>(
    input.config,
    `/pages/${input.pageId}`,
    {
      method: 'PATCH',
      body: JSON.stringify({
        properties: input.properties,
      }),
    }
  );

  if (!response.id) {
    throw new NotionIntegrationError('Notion page update response did not include a page id', true);
  }

  return { id: response.id, url: response.url };
}

export async function getNotionSignupDashboardPage(input: {
  readonly config: NotionSignupDashboardConfig;
  readonly pageId: string;
}): Promise<NotionPageRecord> {
  const response = await notionRequest<NotionRetrievePageResponse>(
    input.config,
    `/pages/${input.pageId}`,
    {
      method: 'GET',
    }
  );

  if (!response.id) {
    throw new NotionIntegrationError(
      'Notion page retrieve response did not include a page id',
      true
    );
  }

  return {
    id: response.id,
    url: response.url,
    properties: response.properties,
  };
}
