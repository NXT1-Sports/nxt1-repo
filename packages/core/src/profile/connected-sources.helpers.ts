/**
 * @fileoverview Connected Sources Helpers
 * @module @nxt1/core/profile
 *
 * Pure helper functions for mapping and deduplicating connected sources.
 * Used by the add-sport wizard (web + mobile) and profile editing flows.
 *
 * 100% portable — NO platform dependencies.
 */

import type { ConnectedSource } from '../models/user/user-base.model';

/**
 * A connected link source entry from the onboarding / add-sport form.
 * This is a subset of the full `LinkSourceEntry` from `@nxt1/core/api`
 * (re-declared here to avoid a circular dependency with the onboarding module).
 */
interface LinkSourceLike {
  readonly platform: string;
  readonly connected: boolean;
  readonly connectionType?: 'link' | 'signin';
  readonly url?: string;
  readonly username?: string;
  readonly scopeType?: 'global' | 'sport' | 'team';
  readonly scopeId?: string;
}

interface ConnectedEmailLike {
  readonly provider: string;
  readonly isActive?: boolean;
}

interface FirebaseProviderLike {
  readonly providerId: string;
}

interface LinkSourcesFormDataLike {
  readonly links: readonly LinkSourceLike[];
}

const FIREBASE_PROVIDER_PLATFORM_MAP = {
  'google.com': 'google',
  'apple.com': 'apple',
  'microsoft.com': 'microsoft',
} as const;

const CONNECTED_EMAIL_PROVIDER_PLATFORM_MAP = {
  gmail: 'google',
  microsoft: 'microsoft',
} as const;

type FirebaseProviderPlatform =
  (typeof FIREBASE_PROVIDER_PLATFORM_MAP)[keyof typeof FIREBASE_PROVIDER_PLATFORM_MAP];
type ConnectedEmailProviderPlatform =
  (typeof CONNECTED_EMAIL_PROVIDER_PLATFORM_MAP)[keyof typeof CONNECTED_EMAIL_PROVIDER_PLATFORM_MAP];

/**
 * Maps connected link-source form entries to the `ConnectedSource` model
 * expected by the profile update endpoint.
 *
 * Only entries that are flagged as connected AND have a non-empty URL are kept.
 */
export function mapToConnectedSources(entries: readonly LinkSourceLike[]): ConnectedSource[] {
  return entries
    .filter((e) => e.connected && e.url?.trim())
    .map((e) => ({
      platform: e.platform,
      profileUrl: e.url ?? '',
      scopeType: e.scopeType,
      scopeId: e.scopeId,
    }));
}

/**
 * Stable deduplication key for a ConnectedSource.
 * Two sources with the same key represent the same logical connection.
 */
export function connectedSourceKey(s: ConnectedSource): string {
  return `${s.platform}|${s.scopeType ?? 'global'}|${s.scopeId ?? ''}`;
}

/**
 * Merges new connected sources into an existing set, deduplicating by
 * platform + scope. New sources overwrite existing ones with the same key.
 */
export function mergeConnectedSources(
  existing: readonly ConnectedSource[],
  incoming: readonly ConnectedSource[]
): ConnectedSource[] {
  const map = new Map<string, ConnectedSource>();
  for (const s of existing) map.set(connectedSourceKey(s), s);
  for (const s of incoming) map.set(connectedSourceKey(s), s);
  return Array.from(map.values());
}

function linkSourceKey(source: LinkSourceLike): string {
  return `${source.connectionType ?? 'link'}|${source.platform}|${source.scopeType ?? 'global'}|${source.scopeId ?? ''}`;
}

/**
 * Maps canonical ConnectedSource records into link-drop form entries.
 */
export function mapConnectedSourcesToLinkSources(
  sources: readonly ConnectedSource[]
): LinkSourceLike[] {
  return sources.map((source) => ({
    platform: source.platform,
    connected: true,
    connectionType: 'link',
    url: source.profileUrl,
    scopeType: source.scopeType ?? 'global',
    scopeId: source.scopeId,
  }));
}

/**
 * Maps Firebase Auth provider state into sign-in entries for the connected-accounts UI.
 */
export function mapFirebaseProvidersToLinkSources(
  providers: readonly FirebaseProviderLike[]
): LinkSourceLike[] {
  return providers
    .map(
      (provider) =>
        FIREBASE_PROVIDER_PLATFORM_MAP[
          provider.providerId as keyof typeof FIREBASE_PROVIDER_PLATFORM_MAP
        ]
    )
    .filter((platform): platform is FirebaseProviderPlatform => typeof platform === 'string')
    .map((platform) => ({
      platform,
      connected: true,
      connectionType: 'signin' as const,
      scopeType: 'global' as const,
    }));
}

/**
 * Maps backend-stored connected email tokens into sign-in entries.
 */
export function mapConnectedEmailsToLinkSources(
  emails: readonly ConnectedEmailLike[],
  existingPlatforms: readonly string[] = []
): LinkSourceLike[] {
  const existing = new Set(existingPlatforms);

  return emails
    .filter((email) => email.isActive !== false)
    .map(
      (email) =>
        CONNECTED_EMAIL_PROVIDER_PLATFORM_MAP[
          email.provider as keyof typeof CONNECTED_EMAIL_PROVIDER_PLATFORM_MAP
        ]
    )
    .filter(
      (platform): platform is ConnectedEmailProviderPlatform =>
        typeof platform === 'string' && !existing.has(platform)
    )
    .map((platform) => ({
      platform,
      connected: true,
      connectionType: 'signin' as const,
      scopeType: 'global' as const,
    }));
}

/**
 * Merges link-source entries while preserving distinct link vs sign-in rows.
 */
export function mergeLinkSources(
  existing: readonly LinkSourceLike[],
  incoming: readonly LinkSourceLike[]
): LinkSourceLike[] {
  const map = new Map<string, LinkSourceLike>();
  for (const source of existing) map.set(linkSourceKey(source), source);
  for (const source of incoming) map.set(linkSourceKey(source), source);
  return Array.from(map.values());
}

/**
 * Builds the canonical link-drop form payload from persisted connected sources,
 * Firebase provider state, and backend-stored email connections.
 */
export function buildLinkSourcesFormData(options: {
  readonly connectedSources?: readonly ConnectedSource[] | null;
  readonly connectedEmails?: readonly ConnectedEmailLike[] | null;
  readonly firebaseProviders?: readonly FirebaseProviderLike[] | null;
}): LinkSourcesFormDataLike | null {
  const linkedSources = mapConnectedSourcesToLinkSources(options.connectedSources ?? []);
  const firebaseSigninLinks = mapFirebaseProvidersToLinkSources(options.firebaseProviders ?? []);
  const emailSigninLinks = mapConnectedEmailsToLinkSources(
    options.connectedEmails ?? [],
    firebaseSigninLinks.map((link) => link.platform)
  );

  const links = mergeLinkSources(
    mergeLinkSources(linkedSources, firebaseSigninLinks),
    emailSigninLinks
  );

  return links.length > 0 ? { links } : null;
}
