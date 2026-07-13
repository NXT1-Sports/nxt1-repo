import 'dotenv/config';

import { db as productionDb } from '../../src/utils/firebase.js';
import { stagingDb } from '../../src/utils/firebase-staging.js';
import {
  getNotionSignupDashboardConfig,
  getNotionSignupDashboardDisabledReason,
  type NotionSignupDashboardConfig,
  type NotionProperties,
} from '../../src/services/marketing/integrations/notion/notion-client.service.js';
import type { RuntimeEnvironment } from '../../src/config/runtime-environment.js';

const LEADS_COLLECTION = 'MarketingB2BOutboundLeads';
const MIN_TIMEOUT_MS = 15_000;
const MAX_ATTEMPTS = 4;

interface NotionPropertyValue {
  readonly type?: string;
  readonly title?: unknown[];
  readonly rich_text?: unknown[];
  readonly email?: string | null;
  readonly status?: { readonly name?: string | null } | null;
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

interface ResetCandidate {
  readonly pageId: string;
  readonly pageUrl?: string;
  readonly email: string;
  readonly organization: string;
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
  return getArg('env') === 'production' ? 'production' : 'staging';
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
      if (!item || typeof item !== 'object') return '';
      const candidate = item as {
        readonly plain_text?: string;
        readonly text?: { readonly content?: string };
      };
      return candidate.plain_text ?? candidate.text?.content ?? '';
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

async function queryContactedPages(config: NotionSignupDashboardConfig): Promise<ResetCandidate[]> {
  if (!config.databaseId) {
    throw new Error('Missing Notion database id.');
  }

  const results: ResetCandidate[] = [];
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
          filter: {
            property: 'Stage',
            status: { equals: 'Contacted' },
          },
        }),
      }
    );

    for (const page of response.results ?? []) {
      const emailProperty = resolveCandidatePropertyName(
        page.properties,
        ['Email', 'Primary Email', 'Contact Email'],
        'email'
      );
      const email = compactText(
        page.properties?.[emailProperty ?? '']?.email ?? undefined
      )?.toLowerCase();
      if (!email) {
        continue;
      }

      const organizationProperty = resolveCandidatePropertyName(
        page.properties,
        ['Organization', 'Company', 'Account'],
        'title'
      );
      const organization =
        compactText(extractPlainText(page.properties?.[organizationProperty ?? '']?.title)) ??
        email;

      results.push({
        pageId: page.id,
        pageUrl: page.url,
        email,
        organization,
      });
    }

    if (!response.has_more || !response.next_cursor) {
      break;
    }

    cursor = response.next_cursor;
  }

  return results;
}

function buildResetProperties(): NotionProperties {
  return {
    Stage: { status: { name: 'Lead' } },
    'Times Contacted': { number: 0 },
    'Last Contacted At': { date: null },
    'Next Follow-Up': { date: null },
    'Next Action': {
      rich_text: [
        {
          type: 'text',
          text: { content: 'Qualify organization and prepare initial outreach.' },
        },
      ],
    },
  };
}

function toLeadIdFromEmail(email: string): string {
  return email
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

async function main(): Promise<void> {
  const environment = resolveEnvironment();
  const shouldCommit = hasFlag('--commit');
  const limit = parsePositiveInteger(getArg('limit'));
  const firestore = environment === 'production' ? productionDb : stagingDb;
  const config = getNotionSignupDashboardConfig(environment);
  const disabledReason = getNotionSignupDashboardDisabledReason(config);

  if (disabledReason) {
    throw new Error(`Notion signup dashboard is unavailable: ${disabledReason}`);
  }

  console.log(`[reset-b2b-contacted-leads] Environment: ${environment.toUpperCase()}`);
  console.log(`[reset-b2b-contacted-leads] Mode: ${shouldCommit ? 'COMMIT' : 'DRY RUN'}`);

  const contacted = await queryContactedPages(config);
  console.log(`[reset-b2b-contacted-leads] Contacted rows found: ${contacted.length}`);

  const targets = limit ? contacted.slice(0, limit) : contacted;
  if (limit) {
    console.log(`[reset-b2b-contacted-leads] Processing limit: ${targets.length}`);
  }

  if (targets.length === 0) {
    return;
  }

  for (const candidate of targets.slice(0, 10)) {
    console.log(` - ${candidate.email} | ${candidate.organization} | ${candidate.pageId}`);
  }
  if (targets.length > 10) {
    console.log(` ... and ${targets.length - 10} more`);
  }

  if (!shouldCommit) {
    console.log('[reset-b2b-contacted-leads] Dry run complete. Re-run with --commit to apply.');
    return;
  }

  let processed = 0;
  for (const candidate of targets) {
    await notionRequest(config, `/pages/${candidate.pageId}`, {
      method: 'PATCH',
      body: JSON.stringify({ properties: buildResetProperties() }),
    });

    const leadId = toLeadIdFromEmail(candidate.email);
    await firestore.collection(LEADS_COLLECTION).doc(leadId).set(
      {
        id: leadId,
        email: candidate.email,
        organization: candidate.organization,
        status: 'lead',
        touchCount: 0,
        sendCount: 0,
        failureCount: 0,
        lastError: null,
        lastContactedAt: null,
        nextFollowUpAt: null,
        paused: false,
        replied: false,
        updatedAt: new Date().toISOString(),
      },
      { merge: true }
    );

    processed += 1;
    if (processed % 10 === 0 || processed === targets.length) {
      console.log(`[reset-b2b-contacted-leads] Progress: ${processed}/${targets.length} reset`);
    }
  }

  console.log(`[reset-b2b-contacted-leads] Reset ${targets.length} contacted leads back to Lead.`);
}

main().catch((error) => {
  console.error('[reset-b2b-contacted-leads] Failed:', error);
  process.exit(1);
});
