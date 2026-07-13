/**
 * Send B2B partner brand awareness campaign.
 *
 * Default mode is dry-run. Use --commit to actually send.
 *
 * Usage examples:
 *   npm run email:b2b-partner:dry-run
 *   npm run email:b2b-partner:send -- --limit=1
 *   npm run email:b2b-partner:dry-run -- --env=production --notion-limit=500
 *
 * By default this script imports Notion rows in Lead/Contacted stages and merges
 * them into the outbound roster. Set --include-notion-leads=false to disable.
 */

import 'dotenv/config';

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { B2B_PARTNER_BRAND_AWARENESS_RECIPIENTS } from '../../src/services/marketing/email/campaigns/b2b/b2b-partner-brand-awareness-recipients.js';
import type { B2BPartnerBrandAwarenessRecipient } from '../../src/services/marketing/email/campaigns/b2b/b2b-partner-brand-awareness-recipients.js';
import {
  buildB2BPartnerBrandAwarenessEmail,
  sendB2BPartnerBrandAwarenessEmail,
} from '../../src/services/marketing/email/campaigns/b2b/b2b-partner-brand-awareness-email.service.js';
import {
  createB2BPartnerCampaignState,
  markB2BPartnerCampaignSent,
  mergeB2BPartnerCampaignState,
  selectB2BPartnerCampaignRecipients,
  summarizeB2BPartnerCampaignState,
  type B2BPartnerCampaignState,
  type B2BPartnerCampaignStateEntry,
} from '../../src/services/marketing/email/campaigns/b2b/b2b-partner-brand-awareness-state.js';
import type { B2BPartnerOutreachSequenceStep } from '../../src/services/marketing/email/campaigns/b2b/b2b-partner-brand-awareness-recipients.js';
import {
  getNotionSignupDashboardConfig,
  getNotionSignupDashboardDisabledReason,
  type NotionSignupDashboardConfig,
} from '../../src/services/marketing/integrations/notion/notion-client.service.js';
import type { RuntimeEnvironment } from '../../src/config/runtime-environment.js';
import { connectToMongoDB, disconnectFromMongoDB } from '../../src/config/database.config.js';

const args = process.argv.slice(2);
const shouldCommit = args.includes('--commit');
const limitArg = args.find((arg) => arg.startsWith('--limit='));
const onlyArg = args.find((arg) => arg.startsWith('--only='));
const previewArg = args.find((arg) => arg.startsWith('--preview='));
const stepArg = args.find((arg) => arg.startsWith('--step='));
const testEmailArg = args.find((arg) => arg.startsWith('--test-email='));
const reportArg = args.find((arg) => arg.startsWith('--report='));
const envArg = args.find((arg) => arg.startsWith('--env='));
const includeNotionLeadsArg = args.find((arg) => arg.startsWith('--include-notion-leads='));
const notionLimitArg = args.find((arg) => arg.startsWith('--notion-limit='));

const scriptDir = dirname(fileURLToPath(import.meta.url));
const defaultReportPath = resolve(
  scriptDir,
  '../../reports/marketing/b2b-partner-program-invite-state.json'
);

const notionEnvironment = (
  envArg?.split('=').slice(1).join('=') ||
  process.env['NODE_ENV'] ||
  'staging'
)
  .toLowerCase()
  .startsWith('prod')
  ? 'production'
  : 'staging';

const includeNotionLeads =
  (includeNotionLeadsArg?.split('=').slice(1).join('=') || 'true').trim().toLowerCase() !== 'false';

const notionLimit = Number.parseInt(notionLimitArg?.split('=').slice(1).join('=') || '1000', 10);

interface NotionRichTextItem {
  readonly plain_text?: string;
  readonly text?: {
    readonly content?: string;
  };
}

interface NotionPagePropertyRecord {
  readonly type?: string;
  readonly title?: unknown[];
  readonly rich_text?: unknown[];
  readonly email?: string | null;
  readonly status?: { readonly name?: string | null } | null;
  readonly select?: { readonly name?: string | null } | null;
}

interface NotionPage {
  readonly id: string;
  readonly properties?: Record<string, NotionPagePropertyRecord>;
}

interface NotionQueryResponse {
  readonly results?: readonly NotionPage[];
  readonly has_more?: boolean;
  readonly next_cursor?: string | null;
}

function parseSequenceStep(value: string | undefined): B2BPartnerOutreachSequenceStep {
  if (!value) {
    return 'initial';
  }

  const normalized = value.trim().toLowerCase();
  if (normalized === 'follow-up' || normalized === 'follow_up') {
    return 'follow_up';
  }
  if (
    normalized === 'final-follow-up' ||
    normalized === 'final_follow_up' ||
    normalized === 'finalfollowup'
  ) {
    return 'final_follow_up';
  }
  return 'initial';
}

function compactText(value: string | null | undefined): string | undefined {
  const normalized = value?.trim();
  return normalized && normalized.length > 0 ? normalized : undefined;
}

function extractPlainText(richText: unknown): string {
  if (!Array.isArray(richText)) return '';
  return richText
    .map((item) => {
      const typed = item as NotionRichTextItem;
      return typed?.plain_text ?? typed?.text?.content ?? '';
    })
    .join('')
    .trim();
}

function resolveCandidatePropertyName(
  properties: Record<string, NotionPagePropertyRecord> | undefined,
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

function extractStatus(
  properties: Record<string, NotionPagePropertyRecord> | undefined
): string | undefined {
  const stageProperty = resolveCandidatePropertyName(properties, ['Stage'], 'status');
  if (!stageProperty) return undefined;
  const status = properties?.[stageProperty]?.status?.name;
  return compactText(status ?? undefined);
}

function extractOrganization(
  properties: Record<string, NotionPagePropertyRecord> | undefined
): string | undefined {
  const organizationProperty = resolveCandidatePropertyName(
    properties,
    ['Organization', 'Company', 'Account'],
    'title'
  );
  if (!organizationProperty) return undefined;
  return compactText(extractPlainText(properties?.[organizationProperty]?.title));
}

function extractPrimaryContact(
  properties: Record<string, NotionPagePropertyRecord> | undefined
): string | undefined {
  const primaryContactProperty = resolveCandidatePropertyName(
    properties,
    ['Primary Contact', 'Contact Name', 'Name'],
    'rich_text'
  );
  if (!primaryContactProperty) return undefined;
  return compactText(extractPlainText(properties?.[primaryContactProperty]?.rich_text));
}

function extractEmail(
  properties: Record<string, NotionPagePropertyRecord> | undefined
): string | undefined {
  const emailProperty = resolveCandidatePropertyName(
    properties,
    ['Email', 'Primary Email', 'Contact Email'],
    'email'
  );
  if (!emailProperty) return undefined;
  return compactText(properties?.[emailProperty]?.email ?? undefined)?.toLowerCase();
}

function extractPartnerType(
  properties: Record<string, NotionPagePropertyRecord> | undefined
): 'School/University' | 'Club/Academy' {
  const typeProperty = resolveCandidatePropertyName(properties, ['Type'], 'select');
  const rawType = compactText(
    properties?.[typeProperty ?? '']?.select?.name ?? undefined
  )?.toLowerCase();

  if (rawType && ['club', 'academy', 'organization'].includes(rawType)) {
    return 'Club/Academy';
  }

  return 'School/University';
}

async function queryNotionPageChunk(input: {
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

async function fetchNotionCampaignRecipients(input: {
  readonly environment: RuntimeEnvironment;
  readonly limit: number;
}): Promise<readonly B2BPartnerBrandAwarenessRecipient[]> {
  const config = getNotionSignupDashboardConfig(input.environment);
  const disabledReason = getNotionSignupDashboardDisabledReason(config);
  if (disabledReason) {
    console.log(`Notion roster import skipped: ${disabledReason}`);
    return [];
  }

  const maxRows = Number.isFinite(input.limit) && input.limit > 0 ? input.limit : 1000;
  const pages: NotionPage[] = [];
  let cursor: string | null = null;

  while (pages.length < maxRows) {
    const response = await queryNotionPageChunk({
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

  const recipients: B2BPartnerBrandAwarenessRecipient[] = [];

  for (const page of pages) {
    const stage = extractStatus(page.properties);
    if (stage !== 'Lead' && stage !== 'Contacted') {
      continue;
    }

    const organization = extractOrganization(page.properties);
    const email = extractEmail(page.properties);
    if (!organization || !email) {
      continue;
    }

    recipients.push({
      organization,
      crmStage: stage,
      partnerType: extractPartnerType(page.properties),
      primaryContact: extractPrimaryContact(page.properties) ?? 'Team Leader',
      email,
      sendCount: 0,
      sequenceStep: 'initial',
      deliveryStatus: 'not_sent',
      lastSentAt: null,
      nextFollowUpAt: null,
      notes: `Imported from Notion (${page.id}).`,
    });
  }

  const deduped = new Map<string, B2BPartnerBrandAwarenessRecipient>();
  for (const recipient of recipients) {
    if (!deduped.has(recipient.email)) {
      deduped.set(recipient.email, recipient);
    }
  }

  return [...deduped.values()];
}

function mergeRecipientRoster(
  base: readonly B2BPartnerBrandAwarenessRecipient[],
  imported: readonly B2BPartnerBrandAwarenessRecipient[]
): B2BPartnerBrandAwarenessRecipient[] {
  const merged = new Map<string, B2BPartnerBrandAwarenessRecipient>();

  for (const recipient of base) {
    merged.set(recipient.email.trim().toLowerCase(), {
      ...recipient,
      email: recipient.email.trim().toLowerCase(),
    });
  }

  for (const recipient of imported) {
    const key = recipient.email.trim().toLowerCase();
    if (merged.has(key)) continue;
    merged.set(key, { ...recipient, email: key });
  }

  return [...merged.values()];
}

function coerceStateEntryToRecipient(
  entry: B2BPartnerCampaignStateEntry
): B2BPartnerBrandAwarenessRecipient {
  return {
    organization: entry.organization,
    crmStage: entry.crmStage,
    partnerType: entry.partnerType,
    primaryContact: entry.primaryContact,
    email: entry.email.trim().toLowerCase(),
    sendCount: entry.sendCount,
    sequenceStep: entry.sequenceStep,
    deliveryStatus: entry.deliveryStatus,
    lastSentAt: entry.lastSentAt,
    nextFollowUpAt: entry.nextFollowUpAt,
    notes: entry.notes,
  };
}

const limit = limitArg ? Number(limitArg.split('=')[1]) : undefined;
const sequenceStep = parseSequenceStep(stepArg?.split('=').slice(1).join('='));
const onlyEmails = onlyArg
  ? new Set(
      onlyArg
        .split('=')
        .slice(1)
        .join('=')
        .split(',')
        .map((email) => email.trim().toLowerCase())
        .filter(Boolean)
    )
  : null;
const testEmail = testEmailArg?.split('=').slice(1).join('=').trim().toLowerCase() || null;
const previewPath = previewArg
  ? resolve(process.cwd(), previewArg.split('=').slice(1).join('='))
  : null;
const reportPath = reportArg
  ? resolve(process.cwd(), reportArg.split('=').slice(1).join('='))
  : defaultReportPath;

function loadCampaignState(
  now: Date,
  recipients: readonly B2BPartnerBrandAwarenessRecipient[]
): B2BPartnerCampaignState {
  if (!existsSync(reportPath)) {
    return createB2BPartnerCampaignState(recipients, now);
  }

  const raw = readFileSync(reportPath, 'utf8');
  const parsed = JSON.parse(raw) as B2BPartnerCampaignState;

  const mergedRoster = mergeRecipientRoster(
    recipients,
    parsed.recipients
      .filter((entry) => !recipients.some((recipient) => recipient.email === entry.email))
      .map(coerceStateEntryToRecipient)
  );

  return mergeB2BPartnerCampaignState(parsed, mergedRoster, now);
}

function persistCampaignState(state: B2BPartnerCampaignState): void {
  mkdirSync(dirname(reportPath), { recursive: true });
  writeFileSync(reportPath, JSON.stringify(state, null, 2), 'utf8');
}

function updateCampaignState(
  state: B2BPartnerCampaignState,
  recipient: B2BPartnerCampaignStateEntry,
  nextRecipient: B2BPartnerCampaignStateEntry,
  now: Date
): B2BPartnerCampaignState {
  return {
    ...state,
    updatedAt: now.toISOString(),
    recipients: state.recipients.map((entry) =>
      entry.email === recipient.email ? nextRecipient : entry
    ),
  };
}

async function main(): Promise<void> {
  await connectToMongoDB();

  const now = new Date();
  try {
    const importedNotionRecipients = includeNotionLeads
      ? await fetchNotionCampaignRecipients({
          environment: notionEnvironment as RuntimeEnvironment,
          limit: notionLimit,
        })
      : [];

    const combinedRecipients = mergeRecipientRoster(
      B2B_PARTNER_BRAND_AWARENESS_RECIPIENTS,
      importedNotionRecipients
    );

    let state = loadCampaignState(now, combinedRecipients);
    let recipients = selectB2BPartnerCampaignRecipients(state, sequenceStep, now);

    if (onlyEmails) {
      recipients = recipients.filter((recipient) => onlyEmails.has(recipient.email));
    }

    if (Number.isFinite(limit) && limit && limit > 0) {
      recipients = recipients.slice(0, limit);
    }

    const preview = buildB2BPartnerBrandAwarenessEmail({
      firstName: recipients[0]?.primaryContact,
      organization: recipients[0]?.organization,
      sequenceStep,
    });
    const summary = summarizeB2BPartnerCampaignState(state, now);

    console.log('B2B partner brand awareness sender');
    console.log(`Mode: ${shouldCommit ? 'COMMIT' : 'DRY RUN'}`);
    console.log(`Campaign: ${preview.campaignKey}`);
    console.log(`Sequence step: ${sequenceStep}`);
    console.log(`Subject: ${preview.subject}`);
    console.log(
      `Roster sources: static=${B2B_PARTNER_BRAND_AWARENESS_RECIPIENTS.length}, notion_imported=${importedNotionRecipients.length}, merged=${combinedRecipients.length}`
    );
    console.log(
      `Notion leads import: ${includeNotionLeads ? 'enabled' : 'disabled'} (${notionEnvironment})`
    );
    console.log(`Roster total: ${summary.total}`);
    console.log(
      `Counters: not_sent=${summary.notSent}, sent=${summary.sent}, follow_up_due=${summary.followUpDue}, follow_up_sent=${summary.followUpSent}, replied=${summary.replied}, paused=${summary.paused}`
    );
    console.log(`Queues: initial=${summary.initialQueue}, follow_up=${summary.followUpQueue}`);
    console.log(`Selected recipients: ${recipients.length}`);
    console.log(`State file: ${reportPath}`);

    if (testEmail) {
      console.log(`Test recipient override: ${testEmail}`);
    }

    if (previewPath) {
      writeFileSync(previewPath, preview.html, 'utf8');
      console.log(`Preview written: ${previewPath}`);
    }

    if (recipients.length === 0) {
      console.log('Nothing to send.');
      return;
    }

    if (!shouldCommit) {
      for (const recipient of recipients) {
        console.log(
          `[DRY] ${recipient.email} | ${recipient.organization} | sends=${recipient.sendCount} | status=${recipient.deliveryStatus} | next=${recipient.nextFollowUpAt ?? 'n/a'}`
        );
      }
      console.log('Dry-run done. Add --commit to send.');
      return;
    }

    persistCampaignState(state);

    let sentCount = 0;

    if (testEmail) {
      const seedRecipient = recipients[0] ?? state.recipients[0];

      if (!seedRecipient) {
        throw new Error('No recipients available to build test email payload.');
      }

      const result = await sendB2BPartnerBrandAwarenessEmail({
        email: testEmail,
        firstName: seedRecipient.primaryContact,
        organization: seedRecipient.organization,
        sequenceStep,
      });

      console.log(
        `Sent test email to ${testEmail} using ${seedRecipient.organization} personalization via ${result.provider}`
      );
      return;
    }

    for (const recipient of recipients) {
      const result = await sendB2BPartnerBrandAwarenessEmail({
        email: recipient.email,
        firstName: recipient.primaryContact,
        organization: recipient.organization,
        sequenceStep,
      });

      const nextRecipient = markB2BPartnerCampaignSent(
        recipient,
        {
          sequenceStep: result.sequenceStep,
          sentAt: now.toISOString(),
          campaignKey: result.campaignKey,
          subject: result.subject,
          provider: result.provider,
          providerMessageId: result.providerMessageId,
        },
        now
      );

      state = updateCampaignState(state, recipient, nextRecipient, now);
      sentCount += 1;
      console.log(
        `Sent ${sentCount}/${recipients.length}: ${recipient.email} | ${recipient.organization}`
      );
    }

    persistCampaignState(state);

    console.log(`Done. Sent: ${sentCount}`);
  } finally {
    await disconnectFromMongoDB().catch(() => undefined);
  }
}

main().catch((err) => {
  console.error('Fatal error:', err instanceof Error ? err.message : String(err));
  process.exit(1);
});
