/**
 * @fileoverview Shared B2B partner lookup helpers for Notion lifecycle services.
 * @module @nxt1/backend/services/marketing/lifecycle/b2b-partner-lookup
 */

import type { Firestore } from 'firebase-admin/firestore';
import type { UserV2Document } from '../../../routes/auth/shared.js';
import {
  type NotionSignupDashboardConfig,
  queryNotionDatabase,
  queryNotionDatabaseByEmail,
} from '../integrations/notion/notion-client.service.js';

export interface B2BPartnerLookupContext {
  readonly email?: string;
  readonly displayName?: string;
  readonly organizationName?: string;
  readonly teamName?: string;
}

export interface ResolvedB2BOrganizationContext extends B2BPartnerLookupContext {
  readonly stateUserId: string;
}

function compactText(value: string | null | undefined): string | undefined {
  const normalized = value?.trim();
  return normalized && normalized.length > 0 ? normalized : undefined;
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

function buildOrganizationMatchCandidates(value: string | null | undefined): readonly string[] {
  const organization = compactText(value);
  if (!organization) return [];

  const candidates = new Set<string>([organization]);
  const stripped = stripOrganizationSuffix(organization);
  if (stripped) candidates.add(stripped);

  const words = stripped.split(/\s+/).filter((word) => word.length > 0);
  if (words.length >= 2) {
    for (let wordCount = words.length - 1; wordCount >= 1; wordCount -= 1) {
      const prefix = words.slice(0, wordCount).join(' ').trim();
      if (prefix.length >= 4) candidates.add(prefix);
    }
  }

  return [...candidates];
}

function resolveDisplayNameFromUser(user: UserV2Document | undefined): string | undefined {
  if (!user) return undefined;

  const userRecord = user as unknown as Record<string, unknown>;
  const explicit = compactText(userRecord['displayName'] as string | undefined);
  if (explicit) return explicit;

  const firstName = compactText(user.firstName);
  const lastName = compactText(user.lastName);
  const parts = [firstName, lastName].filter((part): part is string => Boolean(part));
  return parts.length > 0 ? parts.join(' ') : undefined;
}

function hasAnyLookupKey(context: B2BPartnerLookupContext): boolean {
  return Boolean(
    context.email ?? context.displayName ?? context.organizationName ?? context.teamName
  );
}

export async function resolveB2BOrganizationNameHints(
  db: Firestore,
  organizationId: string
): Promise<Pick<B2BPartnerLookupContext, 'organizationName' | 'teamName'>> {
  const orgSnap = await db.collection('Organizations').doc(organizationId).get();
  if (!orgSnap.exists) {
    return {};
  }

  const org = orgSnap.data() as Record<string, unknown> | undefined;
  return {
    organizationName: compactText(
      (org?.['name'] as string | undefined) ??
        (org?.['organizationName'] as string | undefined) ??
        (org?.['organization'] as string | undefined)
    ),
    teamName: compactText(org?.['teamName'] as string | undefined),
  };
}

export function buildB2BPartnerLookupContext(input: {
  readonly user?: UserV2Document;
  readonly email?: string | null;
  readonly displayName?: string | null;
  readonly organizationName?: string | null;
  readonly teamName?: string | null;
}): B2BPartnerLookupContext | null {
  const context: B2BPartnerLookupContext = {
    email: compactText(input.email) ?? compactText(input.user?.email),
    displayName: compactText(input.displayName) ?? resolveDisplayNameFromUser(input.user),
    organizationName: compactText(input.organizationName),
    teamName: compactText(input.teamName) ?? compactText(input.user?.teamCode?.teamName),
  };

  return hasAnyLookupKey(context) ? context : null;
}

export async function resolveB2BPartnerLookupContextFromOrganization(input: {
  readonly db: Firestore;
  readonly organizationId: string;
  readonly initiatedByUserId?: string;
}): Promise<ResolvedB2BOrganizationContext | null> {
  const orgSnap = await input.db.collection('Organizations').doc(input.organizationId).get();
  if (!orgSnap.exists) return null;

  const org = orgSnap.data() as Record<string, unknown> | undefined;
  const stateUserId = compactText(
    (org?.['billingOwnerUid'] as string | undefined) ??
      (org?.['ownerId'] as string | undefined) ??
      input.initiatedByUserId
  );
  if (!stateUserId) return null;

  const userSnap = await input.db.collection('Users').doc(stateUserId).get();
  const user = userSnap.exists
    ? ((userSnap.data() as UserV2Document | undefined) ?? undefined)
    : undefined;

  const context = buildB2BPartnerLookupContext({
    user,
    email:
      compactText(
        (org?.['billingEmail'] as string | undefined) ?? (org?.['email'] as string | undefined)
      ) ?? compactText(user?.email),
    organizationName: compactText(
      (org?.['name'] as string | undefined) ??
        (org?.['organizationName'] as string | undefined) ??
        (org?.['organization'] as string | undefined)
    ),
    teamName:
      compactText(org?.['teamName'] as string | undefined) ?? compactText(user?.teamCode?.teamName),
  });

  return context ? { stateUserId, ...context } : null;
}

export async function queryExistingB2BPartnerPage(input: {
  readonly config: NotionSignupDashboardConfig;
  readonly context: B2BPartnerLookupContext;
}) {
  const email = compactText(input.context.email);
  if (email) {
    const byEmail = await queryNotionDatabaseByEmail({
      config: input.config,
      property: 'Email',
      email,
    });
    if (byEmail) return byEmail;
  }

  const displayName = compactText(input.context.displayName);
  if (displayName && displayName.length >= 2) {
    const byDisplayName = await queryNotionDatabase({
      config: input.config,
      filter: {
        property: 'Primary Contact',
        rich_text: { equals: displayName },
      },
    });
    if (byDisplayName) return byDisplayName;
  }

  const organizationName = compactText(input.context.organizationName);
  for (const candidate of buildOrganizationMatchCandidates(organizationName)) {
    const byOrganizationName = await queryNotionDatabase({
      config: input.config,
      filter: {
        property: 'Organization',
        title: { equals: candidate },
      },
    });
    if (byOrganizationName) return byOrganizationName;
  }

  const teamName = compactText(input.context.teamName);
  for (const candidate of buildOrganizationMatchCandidates(teamName)) {
    const byTeamName = await queryNotionDatabase({
      config: input.config,
      filter: {
        property: 'Organization',
        title: { equals: candidate },
      },
    });
    if (byTeamName) return byTeamName;
  }

  return null;
}
