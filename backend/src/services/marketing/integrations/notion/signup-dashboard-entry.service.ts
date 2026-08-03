/**
 * @fileoverview Signup Dashboard Notion Entry Service
 * @module @nxt1/backend/services/marketing/integrations/notion/signup-dashboard-entry
 */

import type { UserRole } from '@nxt1/core';
import type { RuntimeEnvironment } from '../../../../config/runtime-environment.js';
import {
  assertNotionPageStatus,
  createNotionSignupDashboardPage,
  getNotionB2CUsersConfig,
  NotionIntegrationError,
  getNotionSignupDashboardPage,
  getNotionSignupDashboardConfig,
  getNotionSignupDashboardDisabledReason,
  queryNotionDatabase,
  queryNotionDatabaseByEmail,
  type NotionPageSummary,
  type NotionProperties,
  updateNotionSignupDashboardPage,
} from './notion-client.service.js';
import {
  compactText,
  mapTextToPropertyValue,
  normalizeIsoDate,
  readNumberProperty,
  readNumberPropertyByCandidates,
  resolveCandidatePropertyName,
  richText,
  textFragment,
} from './notion-property-helpers.js';

export interface SignupDashboardEntryInput {
  readonly userId: string;
  readonly environment: RuntimeEnvironment;
  readonly role: UserRole;
  readonly firstName?: string | null;
  readonly lastName?: string | null;
  readonly displayName?: string | null;
  readonly email?: string | null;
  readonly phone?: string | null;
  readonly primarySport?: string | null;
  readonly teamName?: string | null;
  readonly teamType?: string | null;
  readonly teamId?: string | null;
  readonly organizationId?: string | null;
  readonly organizationType?: string | null;
  readonly city?: string | null;
  readonly state?: string | null;
  readonly referralId?: string | null;
  readonly referralSource?: string | null;
  readonly referralDetails?: string | null;
  readonly referralClubName?: string | null;
  readonly referralOtherSpecify?: string | null;
  readonly teamCode?: string | null;
  readonly teamCodeName?: string | null;
  readonly profileUrl?: string | null;
  readonly completedAt?: Date;
}

export type RecordB2BPartnerContactEventResult =
  | {
      readonly status: 'updated';
      readonly pageId: string;
      readonly pageUrl?: string;
      readonly contactCount: number;
    }
  | {
      readonly status: 'skipped';
      readonly reason:
        | 'disabled'
        | 'missing-token'
        | 'missing-database-id'
        | 'missing-email'
        | 'missing-existing-row';
    };

export type UpsertSignupDashboardEntryResult =
  | {
      readonly status: 'created' | 'existing';
      readonly pageId: string;
      readonly pageUrl?: string;
    }
  | {
      readonly status: 'skipped';
      readonly reason: 'disabled' | 'missing-token' | 'missing-database-id';
    };

export interface B2BOutboundLeadInput {
  readonly environment: RuntimeEnvironment;
  readonly organization: string;
  readonly pageId?: string | null;
  readonly email?: string | null;
  readonly primaryContact?: string | null;
  readonly partnerType?: 'School/University' | 'Club/Academy' | 'Facility/Complex';
  readonly stage?: 'Lead' | 'Contacted' | 'Phone Call Due' | 'Replied' | 'Bounced';
  readonly leadSource?:
    | 'Outbound'
    | 'Outbound Discovery'
    | 'NXT1 Signup'
    | 'Inbound'
    | 'Referral'
    | 'Content';
  readonly nextAction?: string | null;
  readonly notes?: string | null;
  readonly sourceUrl?: string | null;
  readonly timesContacted?: number | null;
  readonly lastContactedAt?: Date | string | null;
  readonly nextFollowUpAt?: Date | string | null;
}

export type UpsertB2BOutboundLeadResult =
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

type SignupLeadSource = 'Outbound' | 'Inbound' | 'Referral' | 'Content';

function includesAnyToken(value: string, tokens: readonly string[]): boolean {
  return tokens.some((token) => value.includes(token));
}

function resolveDisplayName(input: SignupDashboardEntryInput): string {
  const explicit = compactText(input.displayName);
  if (explicit) return explicit;

  const parts = [compactText(input.firstName), compactText(input.lastName)].filter(
    (part): part is string => Boolean(part)
  );
  return parts.length > 0 ? parts.join(' ') : 'New NXT1 User';
}

function resolveKnownDisplayName(input: SignupDashboardEntryInput): string | undefined {
  const explicit = compactText(input.displayName);
  if (explicit) return explicit;

  const parts = [compactText(input.firstName), compactText(input.lastName)].filter(
    (part): part is string => Boolean(part)
  );
  return parts.length > 0 ? parts.join(' ') : undefined;
}

function resolveOrganizationName(input: SignupDashboardEntryInput): string {
  return compactText(input.teamName) ?? resolveDisplayName(input);
}

function resolveLocation(input: SignupDashboardEntryInput): string | undefined {
  const parts = [compactText(input.city), compactText(input.state)].filter((part): part is string =>
    Boolean(part)
  );
  return parts.length > 0 ? parts.join(', ') : undefined;
}

function resolveTeamCode(input: SignupDashboardEntryInput): string | undefined {
  const code = compactText(input.teamCode);
  if (!code) return undefined;

  const codeName = compactText(input.teamCodeName);
  return codeName ? `${code} (${codeName})` : code;
}

function normalizeOrganizationType(value: string | null | undefined): string | undefined {
  const normalized = compactText(value)
    ?.toLowerCase()
    .replace(/[_\s]+/g, '-');
  return normalized;
}

function stripOrganizationSuffix(value: string): string {
  return value
    .replace(/[.,]/g, ' ')
    .replace(
      /\b(?:high school|hs|school|academy|club|college|university|athletic department|athletics|prep|football|basketball|baseball|soccer|volleyball|track(?:\s*&\s*field|\s+and\s+field)?|wrestling|lacrosse|softball|tennis|golf|hockey|cheer|cross country|program|team)\b\s*$/i,
      ''
    )
    .replace(/\s+/g, ' ')
    .trim();
}

function buildOrganizationMatchCandidates(input: {
  readonly organization?: string | null;
  readonly organizationType?: string | null;
}): readonly string[] {
  const organization = compactText(input.organization);
  if (!organization) return [];

  const candidates = new Set<string>([organization]);
  const base = stripOrganizationSuffix(organization);
  if (base.length > 0) {
    candidates.add(base);
  }

  const normalizedType = normalizeOrganizationType(input.organizationType);
  const variantBase = base.length > 0 ? base : organization;

  if (normalizedType === 'high-school' || !normalizedType) {
    candidates.add(`${variantBase} High School`);
    candidates.add(`${variantBase} School`);
    candidates.add(`${variantBase} HS`);
  }

  if (normalizedType === 'club') {
    candidates.add(`${variantBase} Club`);
    candidates.add(`${variantBase} Academy`);
  }

  if (normalizedType === 'college' || normalizedType === 'juco') {
    candidates.add(`${variantBase} College`);
    candidates.add(`${variantBase} University`);
  }

  return [...candidates].filter((candidate) => candidate.length > 0);
}

function buildOrganizationStartsWithCandidates(
  value: string | null | undefined
): readonly string[] {
  const organization = compactText(value);
  if (!organization) return [];

  const base = stripOrganizationSuffix(organization);
  const normalized = base.length > 0 ? base : organization;
  const words = normalized.split(/\s+/).filter((word) => word.length > 0);
  if (words.length < 2) return [];

  const candidates: string[] = [];
  for (let wordCount = words.length - 1; wordCount >= 1; wordCount -= 1) {
    const prefix = words.slice(0, wordCount).join(' ').trim();
    if (prefix.length >= 4) {
      candidates.push(prefix);
    }
  }

  return [...new Set(candidates)];
}

function resolveAccountType(input: SignupDashboardEntryInput): string {
  const normalizedType = normalizeOrganizationType(input.organizationType ?? input.teamType);

  switch (normalizedType) {
    case 'high-school':
      return 'High School';
    case 'middle-school':
      return 'Middle School';
    case 'club':
      return 'Club';
    case 'college':
      return 'College';
    case 'juco':
      return 'JUCO';
    case 'organization':
      return 'Organization';
    default:
      return 'Other';
  }
}

function isSocialMediaReferral(source: string): boolean {
  const normalized = source.toLowerCase();
  if (normalized === 'x') return true;

  return [
    'instagram',
    'ig',
    'tiktok',
    'youtube',
    'x.com',
    'twitter',
    'facebook',
    'linkedin',
    'snapchat',
    'social media',
    'social',
    'reel',
    'short',
    'video',
    'content',
  ].some((token) => normalized.includes(token));
}

function resolveLeadSourceFromSelection(source: string): SignupLeadSource | null {
  const normalized = source.toLowerCase();

  switch (normalized) {
    case 'social':
    case 'advertisement':
    case 'content':
      return 'Content';
    case 'search':
    case 'inbound':
      return 'Inbound';
    case 'friend':
    case 'club':
    case 'team-code':
    case 'team code':
    case 'referral':
    case 'invite_link':
    case 'invite link':
      return 'Referral';
    case 'outbound':
    case 'outbound discovery':
      return 'Outbound';
    default:
      break;
  }

  if (
    includesAnyToken(normalized, [
      'outbound',
      'cold email',
      'cold outreach',
      'sales outreach',
      'prospecting',
      'discovery call',
      'phone call',
    ])
  ) {
    return 'Outbound';
  }

  if (
    includesAnyToken(normalized, [
      'search',
      'google',
      'bing',
      'organic',
      'website',
      'site',
      'seo',
      'inbound',
    ])
  ) {
    return 'Inbound';
  }

  if (
    includesAnyToken(normalized, [
      'referral',
      'friend',
      'teammate',
      'club',
      'invite',
      'team code',
      'team-code',
      'word of mouth',
    ])
  ) {
    return 'Referral';
  }

  if (
    isSocialMediaReferral(normalized) ||
    includesAnyToken(normalized, [
      'advertisement',
      'advertising',
      'sponsored',
      'paid social',
      'paid ad',
      'online ad',
    ])
  ) {
    return 'Content';
  }

  return null;
}

function resolveLeadSourceFromHint(value: string | null | undefined): SignupLeadSource | null {
  const normalized = compactText(value)?.toLowerCase();
  if (!normalized) return null;

  if (
    includesAnyToken(normalized, [
      'outbound',
      'cold email',
      'cold outreach',
      'sales outreach',
      'prospecting',
      'discovery call',
      'phone call',
    ])
  ) {
    return 'Outbound';
  }

  if (
    includesAnyToken(normalized, [
      'search',
      'google',
      'bing',
      'organic',
      'website',
      'site',
      'seo',
      'inbound',
    ])
  ) {
    return 'Inbound';
  }

  if (
    isSocialMediaReferral(normalized) ||
    includesAnyToken(normalized, [
      'advertisement',
      'advertising',
      'sponsored',
      'paid social',
      'paid ad',
      'online ad',
    ])
  ) {
    return 'Content';
  }

  if (
    includesAnyToken(normalized, [
      'referral',
      'friend',
      'teammate',
      'club',
      'invite',
      'team code',
      'team-code',
      'word of mouth',
    ])
  ) {
    return 'Referral';
  }

  return null;
}

function resolveReferralDetails(input: SignupDashboardEntryInput): string | undefined {
  const details = compactText(input.referralDetails);
  const clubName = compactText(input.referralClubName);
  const otherSpecify = compactText(input.referralOtherSpecify);
  const lines = [
    details,
    clubName ? `Club / Team: ${clubName}` : undefined,
    otherSpecify ? `Other: ${otherSpecify}` : undefined,
  ].filter((value): value is string => Boolean(value));

  return lines.length > 0 ? lines.join('\n') : undefined;
}

function resolveLeadSource(input: SignupDashboardEntryInput): SignupLeadSource {
  const referralSource = compactText(input.referralSource);
  const referralId = compactText(input.referralId);
  const selectionLeadSource = referralSource
    ? resolveLeadSourceFromSelection(referralSource)
    : null;

  if (selectionLeadSource) {
    return selectionLeadSource;
  }

  const detailLeadSource = resolveLeadSourceFromHint(resolveReferralDetails(input));
  if (detailLeadSource) {
    return detailLeadSource;
  }

  if (referralSource) {
    return 'Referral';
  }

  if (referralId) {
    return 'Referral';
  }

  return 'Inbound';
}

function buildB2BPartnerSignupNotes(input: SignupDashboardEntryInput): string {
  const completedAt = input.completedAt ?? new Date();
  const referralDetails = resolveReferralDetails(input);
  const lines = [
    'Auto-created from completed NXT1 signup.',
    `NXT1 User ID: ${input.userId}`,
    `Role: ${input.role}`,
    `Environment: ${input.environment}`,
    `Onboarding Completed At: ${completedAt.toISOString()}`,
  ];

  const optionalFields: Array<readonly [string, string | undefined]> = [
    ['Primary Sport', compactText(input.primarySport)],
    ['Team / Program', compactText(input.teamName)],
    ['Team ID', compactText(input.teamId)],
    ['Organization ID', compactText(input.organizationId)],
    ['Location', resolveLocation(input)],
    ['Phone', compactText(input.phone)],
    ['Referral ID', compactText(input.referralId)],
    ['Referral Source', compactText(input.referralSource)],
    ['Referral Details', referralDetails],
    ['Team Code', resolveTeamCode(input)],
    ['NXT1 Profile', compactText(input.profileUrl)],
  ];

  for (const [label, value] of optionalFields) {
    if (value) lines.push(`${label}: ${value}`);
  }

  return lines.join('\n');
}

export function buildSignupDashboardNotionProperties(
  input: SignupDashboardEntryInput
): NotionProperties {
  const email = compactText(input.email) ?? null;
  const phone = compactText(input.phone) ?? null;
  const referralDetails = resolveReferralDetails(input);
  const properties: NotionProperties = {
    Organization: { title: [textFragment(resolveOrganizationName(input))] },
    Stage: { status: { name: 'Onboarding Completed' } },
    Type: { select: { name: resolveAccountType(input) } },
    'Primary Contact': { rich_text: richText(resolveDisplayName(input)) },
    Email: { email },
    Phone: { phone_number: phone },
    'Lead Source': { select: { name: resolveLeadSource(input) } },
    'Times Contacted': { number: 0 },
    '# Members': { number: 1 },
    'Referral Source': { rich_text: richText(input.referralSource) },
    'Referral Details': { rich_text: richText(referralDetails) },
    'Next Action': { rich_text: richText('Review signup and qualify follow-up opportunity.') },
    Notes: { rich_text: richText(buildB2BPartnerSignupNotes(input)) },
  };

  return properties;
}

function buildSignupDashboardPromotionProperties(
  input: SignupDashboardEntryInput
): NotionProperties {
  const email = compactText(input.email) ?? null;
  const referralDetails = resolveReferralDetails(input);
  return {
    Organization: { title: [textFragment(resolveOrganizationName(input))] },
    Stage: { status: { name: 'Onboarding Completed' } },
    Type: { select: { name: resolveAccountType(input) } },
    'Primary Contact': { rich_text: richText(resolveDisplayName(input)) },
    Email: { email },
    'Lead Source': { select: { name: resolveLeadSource(input) } },
    'Referral Source': { rich_text: richText(input.referralSource) },
    'Referral Details': { rich_text: richText(referralDetails) },
    'Next Action': { rich_text: richText('Review signup and qualify follow-up opportunity.') },
    Notes: { rich_text: richText(buildB2BPartnerSignupNotes(input)) },
  };
}

async function applySignupPhoneProperty(input: {
  readonly config: ReturnType<typeof getNotionSignupDashboardConfig>;
  readonly pageId: string;
  readonly phone?: string | null;
}): Promise<void> {
  const phone = compactText(input.phone);
  if (!phone) return;

  const page = await getNotionSignupDashboardPage({
    config: input.config,
    pageId: input.pageId,
  });

  const phoneProperty = resolveCandidatePropertyName(
    page.properties,
    ['Phone', 'Phone Number', 'Primary Phone'],
    'phone_number'
  );

  if (!phoneProperty) return;

  await updateNotionSignupDashboardPage({
    config: input.config,
    pageId: input.pageId,
    properties: {
      [phoneProperty]: { phone_number: phone },
    },
  });
}

async function applySignupSportAndStateProperties(input: {
  readonly config: ReturnType<typeof getNotionSignupDashboardConfig>;
  readonly pageId: string;
  readonly primarySport?: string | null;
  readonly state?: string | null;
}): Promise<void> {
  const sport = compactText(input.primarySport);
  const state = compactText(input.state);
  if (!sport && !state) return;

  const page = await getNotionSignupDashboardPage({
    config: input.config,
    pageId: input.pageId,
  });

  const sportPropertyName =
    resolveCandidatePropertyName(page.properties, ['Sport', 'Primary Sport'], 'select') ??
    resolveCandidatePropertyName(page.properties, ['Sport', 'Primary Sport'], 'rich_text');

  const statePropertyName =
    resolveCandidatePropertyName(page.properties, ['State'], 'select') ??
    resolveCandidatePropertyName(page.properties, ['State'], 'rich_text');

  const properties: NotionProperties = {};

  if (sport && sportPropertyName) {
    const propertyType = page.properties?.[sportPropertyName]?.type;
    const mapped = mapTextToPropertyValue(propertyType, sport);
    if (mapped) {
      properties[sportPropertyName] = mapped;
    }
  }

  if (state && statePropertyName) {
    const propertyType = page.properties?.[statePropertyName]?.type;
    const mapped = mapTextToPropertyValue(propertyType, state);
    if (mapped) {
      properties[statePropertyName] = mapped;
    }
  }

  if (Object.keys(properties).length === 0) return;

  await updateNotionSignupDashboardPage({
    config: input.config,
    pageId: input.pageId,
    properties,
  });
}

async function applySignupMembersRelation(input: {
  readonly config: ReturnType<typeof getNotionSignupDashboardConfig>;
  readonly pageId: string;
  readonly email?: string | null;
  readonly environment: RuntimeEnvironment;
}): Promise<void> {
  const email = compactText(input.email);
  if (!email) return;

  const b2cConfig = getNotionB2CUsersConfig(input.environment);
  const b2cDisabledReason = getNotionSignupDashboardDisabledReason(b2cConfig);
  if (b2cDisabledReason) return;

  const b2cMemberPage = await queryNotionDatabaseByEmail({
    config: b2cConfig,
    property: 'Email',
    email,
  });
  if (!b2cMemberPage) return;

  const page = await getNotionSignupDashboardPage({
    config: input.config,
    pageId: input.pageId,
  });

  const membersPropertyName = resolveCandidatePropertyName(
    page.properties,
    ['Members'],
    'relation'
  );
  if (!membersPropertyName) return;

  const existingRelationIds = Array.isArray(page.properties?.[membersPropertyName]?.relation)
    ? (page.properties?.[membersPropertyName]?.relation ?? [])
        .map((entry) => entry?.id)
        .filter((id): id is string => typeof id === 'string' && id.length > 0)
    : [];

  if (existingRelationIds.includes(b2cMemberPage.id)) return;

  await updateNotionSignupDashboardPage({
    config: input.config,
    pageId: input.pageId,
    properties: {
      [membersPropertyName]: {
        relation: [...new Set([...existingRelationIds, b2cMemberPage.id])].map((id) => ({ id })),
      },
    },
  });
}

async function applyOutboundContactTrackingProperties(input: {
  readonly config: ReturnType<typeof getNotionSignupDashboardConfig>;
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

  const timesContactedProperty = resolveCandidatePropertyName(
    page.properties,
    ['Times Contacted', 'Times contacted', 'Touch Count'],
    'number'
  );
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
    properties[timesContactedProperty] = { number: Math.max(0, Math.floor(input.timesContacted)) };
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

function resolveOutboundType(input: B2BOutboundLeadInput): string {
  switch (input.partnerType) {
    case 'School/University':
      return 'High School';
    case 'Club/Academy':
      return 'Club';
    case 'Facility/Complex':
      return 'Organization';
    default:
      return 'Other';
  }
}

function resolveOutboundLeadSource(input: B2BOutboundLeadInput): string {
  if (input.leadSource === 'Outbound Discovery') return 'Outbound';
  return input.leadSource ?? 'Outbound';
}

function buildOutboundNotes(input: B2BOutboundLeadInput): string {
  const lines = ['Auto-created from B2B outbound discovery workflow.'];
  const sourceUrl = compactText(input.sourceUrl);
  const extraNotes = compactText(input.notes);

  if (sourceUrl) lines.push(`Source URL: ${sourceUrl}`);
  if (extraNotes) lines.push(`Notes: ${extraNotes}`);

  return lines.join('\n');
}

function buildOutboundLeadProperties(input: B2BOutboundLeadInput): NotionProperties {
  const stage = input.stage ?? 'Lead';
  const nextAction =
    compactText(input.nextAction) ??
    (stage === 'Contacted'
      ? 'Follow up in 2 days and update outreach status.'
      : stage === 'Bounced'
        ? 'Lead bounced. Automated outbound sequence stopped.'
        : 'Qualify organization and prepare initial outreach.');

  return {
    Organization: { title: [textFragment(input.organization)] },
    Stage: { status: { name: stage } },
    Type: { select: { name: resolveOutboundType(input) } },
    'Primary Contact': { rich_text: richText(input.primaryContact) },
    Email: { email: compactText(input.email) ?? null },
    'Lead Source': { select: { name: resolveOutboundLeadSource(input) } },
    'Next Action': { rich_text: richText(nextAction) },
    Notes: { rich_text: richText(buildOutboundNotes(input)) },
  };
}

function buildOutboundPromotionProperties(input: B2BOutboundLeadInput): NotionProperties {
  const stage = input.stage ?? 'Lead';
  const nextAction =
    compactText(input.nextAction) ??
    (stage === 'Contacted'
      ? 'Follow up in 2 days and update outreach status.'
      : stage === 'Bounced'
        ? 'Lead bounced. Automated outbound sequence stopped.'
        : 'Qualify organization and prepare initial outreach.');

  return {
    Stage: { status: { name: stage } },
    Type: { select: { name: resolveOutboundType(input) } },
    'Primary Contact': { rich_text: richText(input.primaryContact) },
    'Lead Source': { select: { name: resolveOutboundLeadSource(input) } },
    'Next Action': { rich_text: richText(nextAction) },
    Notes: { rich_text: richText(buildOutboundNotes(input)) },
  };
}

function summarizePage(
  status: 'created' | 'existing',
  page: NotionPageSummary
): UpsertSignupDashboardEntryResult {
  return {
    status,
    pageId: page.id,
    pageUrl: page.url,
  };
}

async function assertSignupDashboardStage(input: {
  readonly config: ReturnType<typeof getNotionSignupDashboardConfig>;
  readonly pageId: string;
  readonly stage: string;
}): Promise<void> {
  await assertNotionPageStatus({
    config: input.config,
    pageId: input.pageId,
    expectedStatus: input.stage,
    propertyName: 'Stage',
  });
}

async function queryExistingB2BPartnerPage(input: {
  readonly config: ReturnType<typeof getNotionSignupDashboardConfig>;
  readonly email?: string | null;
  readonly organization?: string | null;
  readonly organizationType?: string | null;
  readonly primaryContact?: string | null;
  readonly useOrganizationVariants?: boolean;
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

  const organizationCandidates = input.useOrganizationVariants
    ? buildOrganizationMatchCandidates({
        organization: input.organization,
        organizationType: input.organizationType,
      })
    : [compactText(input.organization)].filter((candidate): candidate is string =>
        Boolean(candidate)
      );

  for (const organizationCandidate of organizationCandidates) {
    const byOrganization = await queryNotionDatabase({
      config: input.config,
      filter: {
        property: 'Organization',
        title: { equals: organizationCandidate },
      },
    });
    if (byOrganization) return byOrganization;
  }

  if (input.useOrganizationVariants) {
    for (const organizationPrefix of buildOrganizationStartsWithCandidates(input.organization)) {
      const byOrganizationPrefix = await queryNotionDatabase({
        config: input.config,
        filter: {
          property: 'Organization',
          title: { starts_with: organizationPrefix },
        },
      });
      if (byOrganizationPrefix) return byOrganizationPrefix;
    }
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

export async function upsertSignupDashboardEntry(
  input: SignupDashboardEntryInput
): Promise<UpsertSignupDashboardEntryResult> {
  const config = getNotionSignupDashboardConfig(input.environment);
  const disabledReason = getNotionSignupDashboardDisabledReason(config);
  if (disabledReason) {
    return { status: 'skipped', reason: disabledReason };
  }

  const existing = await queryExistingB2BPartnerPage({
    config,
    email: input.email,
    organization: input.teamName,
    organizationType: input.organizationType ?? input.teamType,
    primaryContact: resolveKnownDisplayName(input),
    useOrganizationVariants: true,
  });

  if (existing) {
    const updated = await updateNotionSignupDashboardPage({
      config,
      pageId: existing.id,
      properties: buildSignupDashboardPromotionProperties(input),
    });
    await assertSignupDashboardStage({
      config,
      pageId: updated.id,
      stage: 'Onboarding Completed',
    });
    try {
      await applySignupPhoneProperty({
        config,
        pageId: updated.id,
        phone: input.phone,
      });
    } catch {
      // Phone enrichment is best-effort and should never block signup lifecycle progression.
    }
    try {
      await applySignupSportAndStateProperties({
        config,
        pageId: updated.id,
        primarySport: input.primarySport,
        state: input.state,
      });
    } catch {
      // Sport/state enrichment is best-effort and should never block signup lifecycle progression.
    }
    try {
      await applySignupMembersRelation({
        config,
        pageId: updated.id,
        email: input.email,
        environment: input.environment,
      });
    } catch {
      // B2C member relation enrichment is best-effort and should never block signup lifecycle progression.
    }
    return summarizePage('existing', updated);
  }

  const created = await createNotionSignupDashboardPage({
    config,
    properties: buildSignupDashboardNotionProperties(input),
  });
  await assertSignupDashboardStage({
    config,
    pageId: created.id,
    stage: 'Onboarding Completed',
  });

  try {
    await applySignupPhoneProperty({
      config,
      pageId: created.id,
      phone: input.phone,
    });
  } catch {
    // Phone enrichment is best-effort and should never block signup lifecycle progression.
  }

  try {
    await applySignupSportAndStateProperties({
      config,
      pageId: created.id,
      primarySport: input.primarySport,
      state: input.state,
    });
  } catch {
    // Sport/state enrichment is best-effort and should never block signup lifecycle progression.
  }

  try {
    await applySignupMembersRelation({
      config,
      pageId: created.id,
      email: input.email,
      environment: input.environment,
    });
  } catch {
    // B2C member relation enrichment is best-effort and should never block signup lifecycle progression.
  }

  return summarizePage('created', created);
}

export async function recordB2BPartnerContactEvent(input: {
  readonly environment: RuntimeEnvironment;
  readonly email?: string | null;
  readonly contactedAt?: Date;
  readonly note?: string | null;
  readonly nextAction?: string | null;
  readonly nextFollowUpAt?: Date | string | null;
  readonly promoteStageToContacted?: boolean;
}): Promise<RecordB2BPartnerContactEventResult> {
  const config = getNotionSignupDashboardConfig(input.environment);
  const disabledReason = getNotionSignupDashboardDisabledReason(config);
  if (disabledReason) {
    return { status: 'skipped', reason: disabledReason };
  }

  const email = compactText(input.email);
  if (!email) {
    return { status: 'skipped', reason: 'missing-email' };
  }

  const existing = await queryNotionDatabaseByEmail({
    config,
    property: 'Email',
    email,
  });

  if (!existing) {
    return { status: 'skipped', reason: 'missing-existing-row' };
  }

  const page = await getNotionSignupDashboardPage({
    config,
    pageId: existing.id,
  });

  const timesContactedProperty = resolveCandidatePropertyName(
    page.properties,
    ['Times Contacted', 'Times contacted', 'Touch Count'],
    'number'
  );
  const lastContactedAtProperty = resolveCandidatePropertyName(
    page.properties,
    ['Last Contacted At', 'Last Contacted'],
    'date'
  );
  const nextActionProperty = resolveCandidatePropertyName(
    page.properties,
    ['Next Action', 'Next action'],
    'rich_text'
  );
  const notesProperty = resolveCandidatePropertyName(
    page.properties,
    ['Notes', 'CRM Notes'],
    'rich_text'
  );
  const stageProperty = resolveCandidatePropertyName(page.properties, ['Stage'], 'status');
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

  const fallbackCount = readNumberPropertyByCandidates(page.properties, [
    'Times Contacted',
    'Times contacted',
    'Touch Count',
  ]);
  const currentContactCount = timesContactedProperty
    ? readNumberProperty(page.properties, timesContactedProperty)
    : fallbackCount;
  const nextContactCount = currentContactCount + 1;
  const properties: NotionProperties = {};

  if (timesContactedProperty) {
    properties[timesContactedProperty] = { number: nextContactCount };
  }

  if (lastContactedAtProperty) {
    properties[lastContactedAtProperty] = {
      date: { start: (input.contactedAt ?? new Date()).toISOString() },
    };
  }

  const nextAction = compactText(input.nextAction);
  if (nextActionProperty && nextAction) {
    properties[nextActionProperty] = { rich_text: richText(nextAction) };
  }

  const note = compactText(input.note);
  if (notesProperty && note) {
    const previousNotes = page.properties?.[notesProperty];
    const existingNoteText = Array.isArray(
      (previousNotes as { rich_text?: unknown[] } | undefined)?.rich_text
    )
      ? (
          (
            previousNotes as {
              rich_text?: Array<{ plain_text?: string; text?: { content?: string } }>;
            }
          ).rich_text ?? []
        )
          .map((fragment) => fragment?.plain_text ?? fragment?.text?.content ?? '')
          .join('')
      : '';
    const mergedNote = compactText(existingNoteText)
      ? `${compactText(existingNoteText)}\n\n${note}`
      : note;
    properties[notesProperty] = { rich_text: richText(mergedNote) };
  }

  if (nextFollowUpProperty && input.nextFollowUpAt !== undefined) {
    const nextFollowUpAt = normalizeIsoDate(input.nextFollowUpAt);
    properties[nextFollowUpProperty] = {
      date: nextFollowUpAt ? { start: nextFollowUpAt } : null,
    };
  }

  if (input.promoteStageToContacted && stageProperty) {
    properties[stageProperty] = { status: { name: 'Contacted' } };
  }

  const updated = await updateNotionSignupDashboardPage({
    config,
    pageId: existing.id,
    properties,
  });
  if (input.promoteStageToContacted && stageProperty) {
    await assertSignupDashboardStage({
      config,
      pageId: updated.id,
      stage: 'Contacted',
    });
  }

  return {
    status: 'updated',
    pageId: updated.id,
    pageUrl: updated.url,
    contactCount: nextContactCount,
  };
}

export async function upsertB2BOutboundLead(
  input: B2BOutboundLeadInput
): Promise<UpsertB2BOutboundLeadResult> {
  const config = getNotionSignupDashboardConfig(input.environment);
  const disabledReason = getNotionSignupDashboardDisabledReason(config);
  if (disabledReason) {
    return { status: 'skipped', reason: disabledReason };
  }

  const organization = compactText(input.organization);
  if (!organization) {
    return { status: 'skipped', reason: 'missing-organization' };
  }

  const knownPageId = compactText(input.pageId);
  const stage = input.stage ?? 'Lead';
  if (knownPageId) {
    try {
      const updated = await updateNotionSignupDashboardPage({
        config,
        pageId: knownPageId,
        properties: buildOutboundPromotionProperties({
          ...input,
          organization,
        }),
      });
      await assertSignupDashboardStage({
        config,
        pageId: updated.id,
        stage,
      });

      await applyOutboundContactTrackingProperties({
        config,
        pageId: updated.id,
        timesContacted: input.timesContacted,
        lastContactedAt: input.lastContactedAt,
        nextFollowUpAt: input.nextFollowUpAt,
      });

      return summarizePage('existing', updated);
    } catch (error) {
      if (!(error instanceof NotionIntegrationError) || error.statusCode !== 404) {
        throw error;
      }
    }
  }

  const email = compactText(input.email);
  const existing = await queryExistingB2BPartnerPage({
    config,
    email,
    organization,
    primaryContact: input.primaryContact,
    useOrganizationVariants: true,
  });

  if (existing) {
    const updated = await updateNotionSignupDashboardPage({
      config,
      pageId: existing.id,
      properties: buildOutboundPromotionProperties({
        ...input,
        organization,
      }),
    });
    await assertSignupDashboardStage({
      config,
      pageId: updated.id,
      stage,
    });

    await applyOutboundContactTrackingProperties({
      config,
      pageId: updated.id,
      timesContacted: input.timesContacted,
      lastContactedAt: input.lastContactedAt,
      nextFollowUpAt: input.nextFollowUpAt,
    });

    return summarizePage('existing', updated);
  }

  const created = await createNotionSignupDashboardPage({
    config,
    properties: buildOutboundLeadProperties({
      ...input,
      organization,
    }),
  });
  await assertSignupDashboardStage({
    config,
    pageId: created.id,
    stage,
  });

  await applyOutboundContactTrackingProperties({
    config,
    pageId: created.id,
    timesContacted: input.timesContacted,
    lastContactedAt: input.lastContactedAt,
    nextFollowUpAt: input.nextFollowUpAt,
  });

  return summarizePage('created', created);
}
