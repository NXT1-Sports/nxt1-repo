/**
 * @fileoverview Notion Investors & Partnerships Entry Service
 * @module @nxt1/backend/services/marketing/integrations/notion/investors-partnerships-entry
 */

import type { RuntimeEnvironment } from '../../../../config/runtime-environment.js';
import {
  createNotionSignupDashboardPage,
  getNotionInvestorsPartnershipsConfig,
  getNotionSignupDashboardDisabledReason,
  getNotionSignupDashboardPage,
  queryNotionDatabase,
  queryNotionDatabaseByEmail,
  type NotionProperties,
  type NotionPageSummary,
  updateNotionSignupDashboardPage,
} from './notion-client.service.js';
import {
  compactText,
  normalizeIsoDate,
  readIntegerPropertyByCandidates,
  resolveCandidatePropertyName,
  richText,
  textFragment,
} from './notion-property-helpers.js';

const TIMES_CONTACTED_PROPERTY_CANDIDATES = [
  'Times Contacted',
  'Times contacted',
  'Touch Count',
] as const;

export type InvestorsPartnershipStage = 'Lead' | 'Contacted' | 'Phone Call Due' | 'Replied';

export interface InvestorsPartnershipLeadInput {
  readonly environment: RuntimeEnvironment;
  readonly organization: string;
  readonly email?: string | null;
  readonly primaryContact?: string | null;
  readonly type?: string | null;
  readonly stage?: InvestorsPartnershipStage;
  readonly leadSource?: string | null;
  readonly nextAction?: string | null;
  readonly notes?: string | null;
  readonly sourceUrl?: string | null;
  readonly timesContacted?: number | null;
  readonly lastContactedAt?: Date | string | null;
  readonly nextFollowUpAt?: Date | string | null;
}

export type UpsertInvestorsPartnershipLeadResult =
  | {
      readonly status: 'created' | 'existing';
      readonly pageId: string;
      readonly pageUrl?: string;
    }
  | {
      readonly status: 'skipped';
      readonly reason:
        | 'disabled'
        | 'missing-token'
        | 'missing-database-id'
        | 'missing-organization';
    };

function summarizePage(
  status: 'created' | 'existing',
  page: NotionPageSummary
): UpsertInvestorsPartnershipLeadResult {
  return {
    status,
    pageId: page.id,
    pageUrl: page.url,
  };
}

function resolveLeadType(input: InvestorsPartnershipLeadInput): string {
  const normalized = compactText(input.type);
  return normalized ?? 'Partnership';
}

function resolveLeadSource(input: InvestorsPartnershipLeadInput): string {
  return compactText(input.leadSource) ?? 'Outbound';
}

function buildNotes(input: InvestorsPartnershipLeadInput): string {
  const lines = ['Auto-created from Investors & Partnerships outbound workflow.'];
  const sourceUrl = compactText(input.sourceUrl);
  const extraNotes = compactText(input.notes);

  if (sourceUrl) lines.push(`Source URL: ${sourceUrl}`);
  if (extraNotes) lines.push(`Notes: ${extraNotes}`);

  return lines.join('\n');
}

function buildLeadProperties(input: InvestorsPartnershipLeadInput): NotionProperties {
  const stage = input.stage ?? 'Lead';
  const nextAction =
    compactText(input.nextAction) ??
    (stage === 'Contacted'
      ? 'Follow up in 2 days and update outreach status.'
      : 'Qualify investor/partner and prepare initial outreach.');

  return {
    'Organization / Name': { title: [textFragment(input.organization)] },
    Stage: { status: { name: stage } },
    Type: { select: { name: resolveLeadType(input) } },
    'Primary Contact': { rich_text: richText(input.primaryContact) },
    Email: { email: compactText(input.email) ?? null },
    'Lead Source': { select: { name: resolveLeadSource(input) } },
    'Next Action': { rich_text: richText(nextAction) },
    Notes: { rich_text: richText(buildNotes(input)) },
  };
}

function resolveTimesContactedPropertyName(
  properties: Record<string, { readonly type?: string } | undefined> | undefined
): string | null {
  return (
    resolveCandidatePropertyName(properties, TIMES_CONTACTED_PROPERTY_CANDIDATES, 'number') ??
    resolveCandidatePropertyName(properties, TIMES_CONTACTED_PROPERTY_CANDIDATES, 'rich_text')
  );
}

function buildTimesContactedPropertyValue(propertyType: string | undefined, count: number) {
  const normalizedCount = Math.max(0, Math.floor(count));
  if (propertyType === 'rich_text') {
    return { rich_text: richText(String(normalizedCount)) };
  }

  return { number: normalizedCount };
}

async function applyContactTrackingProperties(input: {
  readonly config: ReturnType<typeof getNotionInvestorsPartnershipsConfig>;
  readonly pageId: string;
  readonly timesContacted?: number | null;
  readonly lastContactedAt?: Date | string | null;
  readonly nextFollowUpAt?: Date | string | null;
}): Promise<void> {
  const hasTimes =
    typeof input.timesContacted === 'number' && Number.isFinite(input.timesContacted);
  const hasLastContactedAt = normalizeIsoDate(input.lastContactedAt) !== null;
  const hasExplicitNextFollowUp = input.nextFollowUpAt !== undefined;
  if (!hasTimes && !hasLastContactedAt && !hasExplicitNextFollowUp) {
    return;
  }

  const page = await getNotionSignupDashboardPage({
    config: input.config,
    pageId: input.pageId,
  });

  const timesContactedProperty = resolveTimesContactedPropertyName(page.properties);
  const lastContactedAtProperty = resolveCandidatePropertyName(
    page.properties,
    ['Last Contacted At', 'Last Contacted'],
    'date'
  );
  const nextFollowUpProperty = resolveCandidatePropertyName(
    page.properties,
    [
      'Next Follow-Up date',
      'Next Follow-Up Date',
      'Next Follow Up Date',
      'Next Follow-Up',
      'Next Follow Up',
    ],
    'date'
  );

  const properties: NotionProperties = {};

  if (
    timesContactedProperty &&
    typeof input.timesContacted === 'number' &&
    Number.isFinite(input.timesContacted)
  ) {
    properties[timesContactedProperty] = buildTimesContactedPropertyValue(
      page.properties?.[timesContactedProperty]?.type,
      input.timesContacted
    );
  }

  const lastContactedAt = normalizeIsoDate(input.lastContactedAt);
  if (lastContactedAtProperty && lastContactedAt) {
    properties[lastContactedAtProperty] = {
      date: { start: lastContactedAt },
    };
  }

  if (nextFollowUpProperty) {
    const nextFollowUpAt = normalizeIsoDate(input.nextFollowUpAt);
    properties[nextFollowUpProperty] = {
      date: nextFollowUpAt ? { start: nextFollowUpAt } : null,
    };
  }

  if (Object.keys(properties).length === 0) return;

  await updateNotionSignupDashboardPage({
    config: input.config,
    pageId: input.pageId,
    properties,
  });
}

async function queryExistingInvestorsPartnershipPage(input: {
  readonly config: ReturnType<typeof getNotionInvestorsPartnershipsConfig>;
  readonly email?: string | null;
  readonly organization?: string | null;
  readonly primaryContact?: string | null;
}): Promise<NotionPageSummary | null> {
  const email = compactText(input.email);
  if (email) {
    const byEmail = await queryNotionDatabaseByEmail({
      config: input.config,
      property: 'Email',
      email,
    });
    if (byEmail) return byEmail;
  }

  const organization = compactText(input.organization);
  if (organization) {
    const byOrganization = await queryNotionDatabase({
      config: input.config,
      filter: {
        property: 'Organization / Name',
        title: { equals: organization },
      },
    });
    if (byOrganization) return byOrganization;
  }

  const primaryContact = compactText(input.primaryContact);
  if (primaryContact && primaryContact.length >= 3) {
    const byPrimaryContact = await queryNotionDatabase({
      config: input.config,
      filter: {
        property: 'Primary Contact',
        rich_text: { equals: primaryContact },
      },
    });
    if (byPrimaryContact) return byPrimaryContact;
  }

  return null;
}

function readCurrentContactCount(pageProperties: Record<string, unknown> | undefined): number {
  const knownProperties = (pageProperties ?? {}) as Record<
    string,
    { readonly number?: number | null; readonly rich_text?: unknown[] } | undefined
  >;
  return readIntegerPropertyByCandidates(knownProperties, TIMES_CONTACTED_PROPERTY_CANDIDATES);
}

export async function upsertInvestorsPartnershipLead(
  input: InvestorsPartnershipLeadInput
): Promise<UpsertInvestorsPartnershipLeadResult> {
  const config = getNotionInvestorsPartnershipsConfig(input.environment);
  const disabledReason = getNotionSignupDashboardDisabledReason(config);
  if (disabledReason) {
    return { status: 'skipped', reason: disabledReason };
  }

  const organization = compactText(input.organization);
  if (!organization) {
    return { status: 'skipped', reason: 'missing-organization' };
  }

  const email = compactText(input.email);
  const existing = await queryExistingInvestorsPartnershipPage({
    config,
    email,
    organization,
    primaryContact: input.primaryContact,
  });

  if (existing) {
    const existingPage = await getNotionSignupDashboardPage({
      config,
      pageId: existing.id,
    });

    const existingCount = readCurrentContactCount(
      existingPage.properties as Record<string, unknown>
    );
    const inputCount =
      typeof input.timesContacted === 'number' && Number.isFinite(input.timesContacted)
        ? Math.max(0, Math.floor(input.timesContacted))
        : null;
    const nextCount = inputCount ?? existingCount;

    const updated = await updateNotionSignupDashboardPage({
      config,
      pageId: existing.id,
      properties: buildLeadProperties({
        ...input,
        organization,
        timesContacted: nextCount,
      }),
    });

    await applyContactTrackingProperties({
      config,
      pageId: updated.id,
      timesContacted: nextCount,
      lastContactedAt: input.lastContactedAt,
      nextFollowUpAt: input.nextFollowUpAt,
    });

    return summarizePage('existing', updated);
  }

  const created = await createNotionSignupDashboardPage({
    config,
    properties: buildLeadProperties({
      ...input,
      organization,
      timesContacted:
        typeof input.timesContacted === 'number' && Number.isFinite(input.timesContacted)
          ? Math.max(0, Math.floor(input.timesContacted))
          : 0,
    }),
  });

  await applyContactTrackingProperties({
    config,
    pageId: created.id,
    timesContacted:
      typeof input.timesContacted === 'number' && Number.isFinite(input.timesContacted)
        ? Math.max(0, Math.floor(input.timesContacted))
        : 0,
    lastContactedAt: input.lastContactedAt,
    nextFollowUpAt: input.nextFollowUpAt,
  });

  return summarizePage('created', created);
}
