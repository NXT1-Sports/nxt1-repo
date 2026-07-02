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
  | { readonly select: { readonly name: string } | null }
  | { readonly status: { readonly name: string } | null }
  | { readonly date: { readonly start: string } | null }
  | { readonly url: string | null };

export type NotionProperties = Record<string, NotionPropertyValue>;

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
        readonly equals: string;
      };
    };

export interface NotionQueryDatabaseInput {
  readonly config: NotionSignupDashboardConfig;
  readonly filter: NotionQueryFilter;
}

interface NotionQueryDatabaseResponse {
  readonly results?: readonly NotionPageSummary[];
}

interface NotionCreatePageResponse {
  readonly id?: string;
  readonly url?: string;
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

export async function queryNotionDatabase(
  input: NotionQueryDatabaseInput
): Promise<NotionPageSummary | null> {
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
      body: JSON.stringify({ filter: input.filter, page_size: 1 }),
    }
  );

  return response.results?.[0] ?? null;
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
