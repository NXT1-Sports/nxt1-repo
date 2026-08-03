/**
 * @fileoverview B2C Users Notion Entry Service
 * @module @nxt1/backend/services/marketing/integrations/notion/b2c-users-entry
 */

import type { RuntimeEnvironment } from '../../../../config/runtime-environment.js';
import {
  assertNotionPageStatus,
  createNotionSignupDashboardPage,
  getNotionB2CUsersConfig,
  NotionIntegrationError,
  getNotionSignupDashboardConfig,
  getNotionSignupDashboardDisabledReason,
  getNotionSignupDashboardPage,
  queryNotionDatabase,
  queryNotionDatabaseByEmail,
  readNotionStatusProperty,
  type NotionProperties,
  updateNotionSignupDashboardPage,
} from './notion-client.service.js';
import {
  compactText,
  mapTextToPropertyValue,
  normalizeIsoDate,
  resolveCandidatePropertyName,
  richText,
  textFragment,
} from './notion-property-helpers.js';

const ALLOWED_B2C_SPORTS = new Set([
  'Football',
  'Basketball',
  'Baseball',
  'Soccer',
  'Track & Field',
  'Volleyball',
  'Swimming',
  'Other',
]);

export type B2CUsersStage =
  | 'Account Started'
  | 'Onboarding Completed'
  | 'Usage Started'
  | 'Closed Won'
  | 'Expansion / Pricing'
  | 'Organization Mode'
  | 'Closed Lost'
  | 'Churned';

const B2C_USERS_STAGE_RANK: Record<B2CUsersStage, number> = {
  'Account Started': 10,
  'Onboarding Completed': 20,
  'Usage Started': 30,
  'Closed Won': 40,
  'Expansion / Pricing': 50,
  'Organization Mode': 60,
  'Closed Lost': 70,
  Churned: 80,
};

export interface B2CUsersEntryInput {
  readonly userId: string;
  readonly environment: RuntimeEnvironment;
  readonly pageId?: string | null;
  readonly firstName?: string | null;
  readonly lastName?: string | null;
  readonly displayName?: string | null;
  readonly email?: string | null;
  readonly primarySport?: string | null;
  readonly state?: string | null;
  readonly referralId?: string | null;
  readonly referralSource?: string | null;
  readonly referralDetails?: string | null;
  readonly referralClubName?: string | null;
  readonly referralOtherSpecify?: string | null;
  readonly signUpDate?: Date | string | null;
  readonly lastActiveAt?: Date | string | null;
  readonly stage: B2CUsersStage;
  readonly ltvDollars?: number | null;
  readonly usageRevenueMonthlyDollars?: number | null;
  readonly notes?: string | null;
  readonly organizationId?: string | null;
}

type B2CUsersEngagement = 'High' | 'Medium' | 'Low' | 'At Risk';

export type UpsertB2CUsersEntryResult =
  | {
      readonly status: 'created' | 'existing';
      readonly pageId: string;
      readonly pageUrl?: string;
    }
  | {
      readonly status: 'skipped';
      readonly reason: 'disabled' | 'missing-token' | 'missing-database-id' | 'missing-email';
    };

function resolveAthleteName(input: B2CUsersEntryInput): string {
  const explicit = compactText(input.displayName);
  if (explicit) return explicit;

  const parts = [compactText(input.firstName), compactText(input.lastName)].filter(
    (part): part is string => Boolean(part)
  );
  return parts.length > 0 ? parts.join(' ') : 'New NXT1 User';
}

function normalizeSport(value: string | null | undefined): string {
  const normalized = compactText(value);
  if (!normalized) return 'Other';

  const canonical = normalized.toLowerCase() === 'track and field' ? 'Track & Field' : normalized;

  return ALLOWED_B2C_SPORTS.has(canonical) ? canonical : 'Other';
}

function includesAnyToken(value: string, tokens: readonly string[]): boolean {
  return tokens.some((token) => value.includes(token));
}

function resolveB2CReferralSource(
  input: B2CUsersEntryInput
): 'Partner Program' | 'Organic' | 'Social Media' | 'Word of Mouth' | 'Paid Ad' {
  const normalized = compactText(input.referralSource)?.toLowerCase();
  const detail = [
    compactText(input.referralDetails),
    compactText(input.referralClubName),
    compactText(input.referralOtherSpecify),
  ]
    .filter((value): value is string => Boolean(value))
    .join(' ')
    .toLowerCase();

  const combined = `${normalized ?? ''} ${detail}`.trim();

  if (
    compactText(input.referralId) ||
    includesAnyToken(combined, ['partner', 'team code', 'team-code', 'club', 'academy'])
  ) {
    return 'Partner Program';
  }

  if (includesAnyToken(combined, ['instagram', 'tiktok', 'youtube', 'social', 'twitter', 'x '])) {
    return 'Social Media';
  }

  if (includesAnyToken(combined, ['paid ad', 'paid social', 'advertisement', 'advertising'])) {
    return 'Paid Ad';
  }

  if (includesAnyToken(combined, ['friend', 'word of mouth', 'parent', 'coach referral'])) {
    return 'Word of Mouth';
  }

  return 'Organic';
}

function roundCurrency(value: number | null | undefined): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  return Math.round(value * 100) / 100;
}

function looksLikeEmail(value: string | null | undefined): boolean {
  const normalized = compactText(value);
  return Boolean(normalized && normalized.includes('@'));
}

function toDate(value: Date | string | null | undefined): Date | null {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function asB2CUsersStage(value: string | null): B2CUsersStage | null {
  return value && value in B2C_USERS_STAGE_RANK ? (value as B2CUsersStage) : null;
}

function resolveMonotonicB2CStage(input: {
  readonly currentStage: B2CUsersStage | null;
  readonly incomingStage: B2CUsersStage;
}): B2CUsersStage {
  if (!input.currentStage) return input.incomingStage;
  return B2C_USERS_STAGE_RANK[input.incomingStage] >= B2C_USERS_STAGE_RANK[input.currentStage]
    ? input.incomingStage
    : input.currentStage;
}

function resolveEngagement(input: B2CUsersEntryInput): B2CUsersEngagement {
  const lastActiveAt = toDate(input.lastActiveAt);
  const inactiveDays = lastActiveAt
    ? Math.floor((Date.now() - lastActiveAt.getTime()) / (24 * 60 * 60 * 1000))
    : null;

  if (inactiveDays !== null && inactiveDays > 30) {
    return 'At Risk';
  }

  if (
    input.stage === 'Closed Won' ||
    input.stage === 'Expansion / Pricing' ||
    input.stage === 'Organization Mode'
  ) {
    return inactiveDays !== null && inactiveDays > 14 ? 'Medium' : 'High';
  }

  if (input.stage === 'Usage Started') {
    return inactiveDays !== null && inactiveDays > 14 ? 'Low' : 'Medium';
  }

  return inactiveDays !== null && inactiveDays > 14 ? 'Low' : 'Medium';
}

function buildAutoNotes(input: B2CUsersEntryInput): string {
  const lines = [
    `Auto-synced from NXT1 B2C lifecycle (${input.stage}).`,
    `NXT1 User ID: ${input.userId}`,
    `Environment: ${input.environment}`,
  ];

  const optionalFields: Array<readonly [string, string | undefined]> = [
    ['Sport', compactText(input.primarySport)],
    ['State', compactText(input.state)],
    ['Referral ID', compactText(input.referralId)],
    ['Referral Source', compactText(input.referralSource)],
    ['Referral Details', compactText(input.referralDetails)],
    ['Referral Club', compactText(input.referralClubName)],
    ['Referral Other', compactText(input.referralOtherSpecify)],
    ['Organization ID', compactText(input.organizationId)],
  ];

  for (const [label, value] of optionalFields) {
    if (value) lines.push(`${label}: ${value}`);
  }

  const extraNotes = compactText(input.notes);
  if (extraNotes) {
    lines.push(extraNotes);
  }

  return lines.join('\n');
}

export function buildB2CUsersNotionProperties(input: B2CUsersEntryInput): NotionProperties {
  const email = compactText(input.email);
  if (!email) {
    throw new Error('B2C Users sync requires an email address');
  }

  const signUpDate = normalizeIsoDate(input.signUpDate);
  const lastActiveAt = normalizeIsoDate(input.lastActiveAt);
  const ltvDollars = roundCurrency(input.ltvDollars);
  const usageRevenueMonthlyDollars = roundCurrency(input.usageRevenueMonthlyDollars);

  const properties: NotionProperties = {
    Name: { title: [textFragment(resolveAthleteName(input))] },
    Email: { email },
    Stage: { status: { name: input.stage } },
    Engagement: { select: { name: resolveEngagement(input) } },
    Sport: { select: { name: normalizeSport(input.primarySport) } },
    'Referral Source': { select: { name: resolveB2CReferralSource(input) } },
    Notes: { rich_text: richText(buildAutoNotes(input)) },
  };

  if (signUpDate) {
    properties['Sign-Up Date'] = { date: { start: signUpDate } };
  }

  if (lastActiveAt) {
    properties['Last Active'] = { date: { start: lastActiveAt } };
  }

  if (ltvDollars !== null) {
    properties['LTV'] = { number: ltvDollars };
  }

  if (usageRevenueMonthlyDollars !== null) {
    properties['Usage Revenue ($/mo)'] = { number: usageRevenueMonthlyDollars };
  }

  return properties;
}

async function updateExistingB2CUsersPage(input: {
  readonly config: ReturnType<typeof getNotionB2CUsersConfig>;
  readonly pageId: string;
  readonly properties: NotionProperties;
  readonly expectedStage: B2CUsersStage;
  readonly state?: string | null;
  readonly partnerRelationIds: readonly string[];
}): Promise<UpsertB2CUsersEntryResult> {
  const existingPage = await getNotionSignupDashboardPage({
    config: input.config,
    pageId: input.pageId,
  });
  const currentStage = asB2CUsersStage(readNotionStatusProperty(existingPage.properties, 'Stage'));
  const resolvedStage = resolveMonotonicB2CStage({
    currentStage,
    incomingStage: input.expectedStage,
  });
  const properties =
    resolvedStage === input.expectedStage
      ? input.properties
      : Object.fromEntries(
          Object.entries(input.properties).filter(([propertyName]) => propertyName !== 'Stage')
        );

  const updated = await updateNotionSignupDashboardPage({
    config: input.config,
    pageId: input.pageId,
    properties,
  });

  await assertNotionPageStatus({
    config: input.config,
    pageId: updated.id,
    expectedStatus: resolvedStage,
  });

  try {
    await applyB2CSchemaAwareProperties({
      config: input.config,
      pageId: updated.id,
      state: input.state,
      partnerRelationIds: input.partnerRelationIds,
    });
  } catch {
    // State / partner enrichment is best-effort and should never block lifecycle progression.
  }

  return { status: 'existing', pageId: updated.id, pageUrl: updated.url };
}

async function resolveB2CPartnerRelationIds(input: {
  readonly environment: RuntimeEnvironment;
  readonly referralId?: string | null;
  readonly referralClubName?: string | null;
}): Promise<readonly string[]> {
  const signupConfig = getNotionSignupDashboardConfig(input.environment);
  const disabledReason = getNotionSignupDashboardDisabledReason(signupConfig);
  if (disabledReason) {
    return [];
  }

  const referralClubName = compactText(input.referralClubName);
  const referralId = compactText(input.referralId);
  const candidateEmails = looksLikeEmail(referralId) ? [referralId as string] : [];

  for (const candidateEmail of candidateEmails) {
    const byEmail = await queryNotionDatabaseByEmail({
      config: signupConfig,
      property: 'Email',
      email: candidateEmail,
    });
    if (byEmail) {
      return [byEmail.id];
    }
  }

  if (referralClubName) {
    const byOrganization = await queryNotionDatabase({
      config: signupConfig,
      filter: {
        property: 'Organization',
        title: { equals: referralClubName },
      },
    });
    if (byOrganization) {
      return [byOrganization.id];
    }
  }

  return [];
}

async function applyB2CSchemaAwareProperties(input: {
  readonly config: ReturnType<typeof getNotionB2CUsersConfig>;
  readonly pageId: string;
  readonly state?: string | null;
  readonly partnerRelationIds?: readonly string[];
}): Promise<void> {
  const state = compactText(input.state);
  const partnerRelationIds = Array.from(new Set(input.partnerRelationIds ?? [])).filter(
    (id): id is string => typeof id === 'string' && id.trim().length > 0
  );

  if (!state && partnerRelationIds.length === 0) {
    return;
  }

  const page = await getNotionSignupDashboardPage({
    config: input.config,
    pageId: input.pageId,
  });

  const properties: NotionProperties = {};

  if (state) {
    const statePropertyName =
      resolveCandidatePropertyName(page.properties, ['State'], 'select') ??
      resolveCandidatePropertyName(page.properties, ['State'], 'rich_text');

    if (statePropertyName) {
      const propertyType = page.properties?.[statePropertyName]?.type;
      const mapped = mapTextToPropertyValue(propertyType, state);
      if (mapped) {
        properties[statePropertyName] = mapped;
      }
    }
  }

  if (partnerRelationIds.length > 0) {
    const partnerPropertyName = resolveCandidatePropertyName(
      page.properties,
      ['Partner'],
      'relation'
    );
    if (partnerPropertyName) {
      const existingRelationIds = Array.isArray(page.properties?.[partnerPropertyName]?.relation)
        ? (page.properties?.[partnerPropertyName]?.relation ?? [])
            .map((entry) => entry?.id)
            .filter((id): id is string => typeof id === 'string' && id.length > 0)
        : [];

      const mergedIds = [...new Set([...existingRelationIds, ...partnerRelationIds])];
      if (mergedIds.length !== existingRelationIds.length) {
        properties[partnerPropertyName] = {
          relation: mergedIds.map((id) => ({ id })),
        };
      }
    }
  }

  if (Object.keys(properties).length === 0) {
    return;
  }

  await updateNotionSignupDashboardPage({
    config: input.config,
    pageId: input.pageId,
    properties,
  });
}

export async function upsertB2CUsersEntry(
  input: B2CUsersEntryInput
): Promise<UpsertB2CUsersEntryResult> {
  const config = getNotionB2CUsersConfig(input.environment);
  const disabledReason = getNotionSignupDashboardDisabledReason(config);
  if (disabledReason) {
    return { status: 'skipped', reason: disabledReason };
  }

  const email = compactText(input.email);
  if (!email) {
    return { status: 'skipped', reason: 'missing-email' };
  }

  const properties = buildB2CUsersNotionProperties(input);
  const partnerRelationIds = await resolveB2CPartnerRelationIds({
    environment: input.environment,
    referralId: input.referralId,
    referralClubName: input.referralClubName,
  });
  const knownPageId = compactText(input.pageId);
  if (knownPageId) {
    try {
      return await updateExistingB2CUsersPage({
        config,
        pageId: knownPageId,
        properties,
        expectedStage: input.stage,
        state: input.state,
        partnerRelationIds,
      });
    } catch (error) {
      if (!(error instanceof NotionIntegrationError) || error.statusCode !== 404) {
        throw error;
      }
    }
  }

  const existing = await queryNotionDatabaseByEmail({
    config,
    property: 'Email',
    email,
  });

  if (existing) {
    return updateExistingB2CUsersPage({
      config,
      pageId: existing.id,
      properties,
      expectedStage: input.stage,
      state: input.state,
      partnerRelationIds,
    });
  }

  const created = await createNotionSignupDashboardPage({
    config,
    properties,
  });

  await assertNotionPageStatus({
    config,
    pageId: created.id,
    expectedStatus: input.stage,
  });

  try {
    await applyB2CSchemaAwareProperties({
      config,
      pageId: created.id,
      state: input.state,
      partnerRelationIds,
    });
  } catch {
    // State / partner enrichment is best-effort and should never block lifecycle progression.
  }

  return { status: 'created', pageId: created.id, pageUrl: created.url };
}
