/**
 * @fileoverview Signup Dashboard Notion Entry Service
 * @module @nxt1/backend/services/marketing/integrations/notion/signup-dashboard-entry
 */

import type { UserRole } from '@nxt1/core';
import type { RuntimeEnvironment } from '../../../../config/runtime-environment.js';
import {
  createNotionSignupDashboardPage,
  getNotionSignupDashboardConfig,
  getNotionSignupDashboardDisabledReason,
  queryNotionDatabaseByEmail,
  type NotionPageSummary,
  type NotionProperties,
  type NotionRichTextFragment,
} from './notion-client.service.js';

export interface SignupDashboardEntryInput {
  readonly userId: string;
  readonly environment: RuntimeEnvironment;
  readonly role: UserRole;
  readonly firstName?: string | null;
  readonly lastName?: string | null;
  readonly displayName?: string | null;
  readonly email?: string | null;
  readonly primarySport?: string | null;
  readonly teamName?: string | null;
  readonly teamId?: string | null;
  readonly organizationId?: string | null;
  readonly city?: string | null;
  readonly state?: string | null;
  readonly referralId?: string | null;
  readonly teamCode?: string | null;
  readonly teamCodeName?: string | null;
  readonly profileUrl?: string | null;
  readonly completedAt?: Date;
}

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

function textFragment(content: string): NotionRichTextFragment {
  return { type: 'text', text: { content } };
}

function compactText(value: string | null | undefined): string | undefined {
  const normalized = value?.trim();
  return normalized && normalized.length > 0 ? normalized : undefined;
}

function richText(value: string | null | undefined): readonly NotionRichTextFragment[] {
  const normalized = compactText(value);
  return normalized ? [textFragment(normalized)] : [];
}

function resolveDisplayName(input: SignupDashboardEntryInput): string {
  const explicit = compactText(input.displayName);
  if (explicit) return explicit;

  const parts = [compactText(input.firstName), compactText(input.lastName)].filter(
    (part): part is string => Boolean(part)
  );
  return parts.length > 0 ? parts.join(' ') : 'New NXT1 User';
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

function buildB2BPartnerSignupNotes(input: SignupDashboardEntryInput): string {
  const completedAt = input.completedAt ?? new Date();
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
    ['Referral ID', compactText(input.referralId)],
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
  const properties: NotionProperties = {
    Organization: { title: [textFragment(resolveOrganizationName(input))] },
    Stage: { status: { name: 'Account Started' } },
    Type: { select: { name: 'Other' } },
    'Primary Contact': { rich_text: richText(resolveDisplayName(input)) },
    Email: { email },
    'Lead Source': { select: { name: 'NXT1 Signup' } },
    'Next Action': { rich_text: richText('Review signup and qualify follow-up opportunity.') },
    Notes: { rich_text: richText(buildB2BPartnerSignupNotes(input)) },
  };

  return properties;
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

export async function upsertSignupDashboardEntry(
  input: SignupDashboardEntryInput
): Promise<UpsertSignupDashboardEntryResult> {
  const config = getNotionSignupDashboardConfig(input.environment);
  const disabledReason = getNotionSignupDashboardDisabledReason(config);
  if (disabledReason) {
    return { status: 'skipped', reason: disabledReason };
  }

  const email = compactText(input.email);
  const existing = email
    ? await queryNotionDatabaseByEmail({
        config,
        property: 'Email',
        email,
      })
    : null;

  if (existing) {
    return summarizePage('existing', existing);
  }

  const created = await createNotionSignupDashboardPage({
    config,
    properties: buildSignupDashboardNotionProperties(input),
  });

  return summarizePage('created', created);
}
