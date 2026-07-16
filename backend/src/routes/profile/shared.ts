/**
 * @fileoverview Profile routes — shared types, helpers, cache utils, and mappers.
 * Imported by all sub-routers under routes/profile/.
 */

import type { DocumentData, Firestore } from 'firebase-admin/firestore';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { logger } from '../../utils/logger.js';
import { getCacheService, CACHE_TTL } from '../../services/core/cache.service.js';
import {
  CACHE_KEYS as USER_CACHE_KEYS,
  buildUsersBatchCachePrefix,
} from '../../services/profile/users.service.js';
import { buildAgentContextCacheKey } from '../../modules/agent/memory/context-builder.js';
import {
  FIREBASE_MCP_SHARED_PROFILE_COUPLED_VIEWS,
  buildFirebaseMcpListViewsCachePrefix,
  buildFirebaseMcpQueryViewWideCachePrefix,
  buildFirebaseMcpQueryViewViewerCachePrefix,
} from '../../modules/agent/tools/integrations/firebase-mcp/firebase-mcp-bridge.service.js';
import { createRosterEntryService } from '../../services/team/roster-entry.service.js';
import { createOrganizationService } from '../../services/team/organization.service.js';
import { createProfileHydrationService } from '../../services/profile/profile-hydration.service.js';
import * as teamCodeService from '../../services/team/team-code.service.js';
import type { User, UserSummary, SportProfile, ProfileSearchParams } from '@nxt1/core';
import { PROFILE_CACHE_KEYS } from '@nxt1/core';

// Re-export FieldValue so mutation routes can use it without re-importing
export { FieldValue };
export { teamCodeService };

// ─── Collections ────────────────────────────────────────────────────────────

export const USERS_COLLECTION = 'Users';
export const PLAYER_STATS_COLLECTION = 'PlayerStats';

export function resolvePublicStorageBucket(): string {
  const productionBucket = process.env['FIREBASE_STORAGE_BUCKET'] ?? '';
  const stagingBucket = process.env['STAGING_FIREBASE_STORAGE_BUCKET'] ?? '';
  const runtimeEnv = (process.env['NODE_ENV'] ?? process.env['APP_ENV'] ?? '').toLowerCase();
  const projectId = (
    process.env['GOOGLE_CLOUD_PROJECT'] ??
    process.env['GCLOUD_PROJECT'] ??
    process.env['FIREBASE_PROJECT_ID'] ??
    ''
  ).toLowerCase();

  if (runtimeEnv === 'staging' || projectId.includes('staging')) {
    return stagingBucket || productionBucket;
  }

  if (runtimeEnv === 'production') {
    return productionBucket;
  }

  return productionBucket || stagingBucket;
}

function toPublicStorageUrl(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const raw = value.trim();
  if (!raw) return undefined;

  if (raw.startsWith('gs://')) {
    const withoutScheme = raw.slice('gs://'.length);
    const slashIndex = withoutScheme.indexOf('/');
    if (slashIndex <= 0) return undefined;
    const bucket = withoutScheme.slice(0, slashIndex);
    const objectPath = withoutScheme.slice(slashIndex + 1).replace(/^\/+/, '');
    if (!bucket || !objectPath) return undefined;
    return `https://storage.googleapis.com/${bucket}/${objectPath
      .split('/')
      .map((segment) => encodeURIComponent(segment))
      .join('/')}`;
  }

  if (/^https?:\/\//i.test(raw)) {
    try {
      const parsed = new URL(raw);
      if (parsed.hostname === 'firebasestorage.googleapis.com') {
        return raw;
      }
    } catch {
      return raw;
    }

    return raw;
  }

  // Legacy raw storage paths persisted in user docs (e.g., Users/<uid>/profile/avatar.jpg)
  if (!raw.includes('/')) return raw;
  const bucket = resolvePublicStorageBucket();
  const objectPath = raw.replace(/^\/+/, '');
  if (!bucket || !objectPath) return raw;

  return `https://storage.googleapis.com/${bucket}/${objectPath
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/')}`;
}

// ─── Types ──────────────────────────────────────────────────────────────────

export type UserFirestoreDoc = DocumentData & {
  email?: string;
  emailVerified?: boolean;
  firstName?: string;
  lastName?: string;
  displayName?: string;
  username?: string;
  unicode?: string | null;
  gender?: string;
  role?: string;
  status?: string;

  profileImgs?: string[];
  aboutMe?: string;
  height?: string;
  weight?: string;
  classOf?: number;
  academics?: Record<string, unknown>;
  sports?: SportProfile[];
  activeSportIndex?: number;
  primarySport?: string;
  location?: Record<string, string>;
  contact?: Record<string, string>;
  social?: Array<{
    platform: string;
    url: string;
    username?: string;
    displayOrder?: number;
    verified?: boolean;
  }>;
  state?: string;
  city?: string;
  athlete?: Record<string, unknown>;
  coach?: Record<string, unknown>;
  director?: Record<string, unknown>;
  parent?: Record<string, unknown>;
  verificationStatus?: string;
  connectedSources?: Array<{
    platform: string;
    profileUrl: string;
    faviconUrl?: string;
    lastSyncedAt?: string;
    syncStatus?: string;
    lastError?: string;
    scopeType?: string;
    scopeId?: string;
    displayOrder?: number;
    createdAt?: string;
    email?: string;
  }>;
  connectedEmails?: Array<Record<string, unknown>>;
  awards?: Array<Record<string, unknown>>;
  teamHistory?: Array<Record<string, unknown>>;
  preferences?: Record<string, unknown>;
  _counters?: Record<string, unknown>;
  onboardingCompleted?: boolean;
  updatedAt?: string;
  createdAt?: string;
  lastLoginAt?: string;
  _schemaVersion?: number;
  teamCode?: Record<string, unknown> | string | null;
  profileCode?: string;
};

// ─── Cache Key Builders ──────────────────────────────────────────────────────

export function buildProfileByIdCacheKey(userId: string): string {
  return `${PROFILE_CACHE_KEYS.BY_ID}${userId}`;
}

export function buildProfileByUnicodeCacheKey(unicode: string): string {
  return `${PROFILE_CACHE_KEYS.BY_UNICODE}${unicode.toLowerCase()}`;
}

export function buildProfileSearchCacheKey(params: ProfileSearchParams): string {
  const parts = (Object.keys(params) as Array<keyof ProfileSearchParams>)
    .filter((k) => params[k] !== undefined && params[k] !== null && params[k] !== '')
    .sort()
    .map((k) => `${k}:${params[k]}`);

  return parts.length > 0
    ? `${PROFILE_CACHE_KEYS.SEARCH}${parts.join(':')}`
    : `${PROFILE_CACHE_KEYS.SEARCH}all`;
}

// ─── Cache Invalidation ──────────────────────────────────────────────────────

/**
 * Invalidate all cached representations of a user profile.
 * Exported for use by auth.routes, edit-profile.routes, upload.routes,
 * settings.routes, webhooks, and agent tools.
 */
export async function invalidateProfileCaches(
  userId: string,
  unicode?: string | null
): Promise<void> {
  const cache = getCacheService();

  const keysToDelete: string[] = [
    buildProfileByIdCacheKey(userId),
    USER_CACHE_KEYS.USER_BY_ID(userId),
    buildAgentContextCacheKey(userId),
  ];
  if (unicode) {
    keysToDelete.push(buildProfileByUnicodeCacheKey(unicode));
  }

  await Promise.all(keysToDelete.map((k) => cache.del(k)));
  await Promise.all([
    cache.delByPrefix(buildUsersBatchCachePrefix()),
    cache.delByPrefix(`${buildFirebaseMcpListViewsCachePrefix(userId)}:`),
    cache.delByPrefix(`${buildFirebaseMcpQueryViewViewerCachePrefix(userId)}:`),
    cache.delByPrefix(`profile:sub:timeline:v2:${userId}`),
    cache.delByPrefix(`profile:sub:stats:${userId}:`),
    cache.delByPrefix(`profile:sub:gamelogs:${userId}:`),
    cache.delByPrefix(`profile:metrics:${userId}:`),
    cache.delByPrefix(`profile:sub:awards:${userId}`),
    cache.delByPrefix(`profile:sub:rankings:${userId}:`),
    cache.delByPrefix(`profile:sub:schedule:${userId}`),
    cache.del(`profile:${userId}:recruiting:all`),
    cache.delByPrefix(`profile:${userId}:recruiting:`),
    cache.delByPrefix(`profile:sub:news:${userId}:`),
    cache.delByPrefix(`profile:sub:scout-reports:${userId}:`),
  ]);

  await Promise.all(
    FIREBASE_MCP_SHARED_PROFILE_COUPLED_VIEWS.map((view) =>
      cache.delByPrefix(`${buildFirebaseMcpQueryViewWideCachePrefix(view)}:`)
    )
  );

  await invalidateSharedTeamProfileCaches(userId);

  await cache.del(`${PROFILE_CACHE_KEYS.SEARCH}*`);

  logger.debug('[Profile] Cache invalidated', { userId, unicode });
}

async function invalidateSharedTeamProfileCaches(userId: string): Promise<void> {
  try {
    const db = getFirestore();
    const rosterEntryService = createRosterEntryService(db);
    const memberships = await rosterEntryService.getUserTeams({
      userId,
      includeInactive: true,
    });

    const teamIds = [
      ...new Set(
        memberships
          .map((entry) => entry.teamId)
          .filter((teamId): teamId is string => typeof teamId === 'string' && teamId.length > 0)
      ),
    ];
    if (teamIds.length === 0) {
      return;
    }

    const cache = getCacheService();
    const invalidations: Promise<unknown>[] = teamIds.map((teamId) =>
      cache.delByPrefix(`team:profile:id:${teamId}:`)
    );

    const teams = await Promise.all(
      teamIds.map(async (teamId) => {
        try {
          const { team } = await teamCodeService.getTeamCodeById(db, teamId, false);
          return team;
        } catch {
          return null;
        }
      })
    );

    for (const team of teams) {
      if (!team) continue;
      if (typeof team.teamCode === 'string' && team.teamCode.trim().length > 0) {
        invalidations.push(cache.delByPrefix(`team:profile:code:${team.teamCode}:`));
      }
      const slug =
        typeof team.slug === 'string' && team.slug.trim().length > 0
          ? team.slug
          : typeof team.unicode === 'string' && team.unicode.trim().length > 0
            ? team.unicode
            : null;
      if (slug) {
        invalidations.push(cache.delByPrefix(`team:profile:slug:${slug}:`));
      }
    }

    await Promise.allSettled(invalidations);
  } catch (error) {
    logger.warn('[Profile] Failed to invalidate shared team profile caches', {
      userId,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

// ─── Document Mappers ─────────────────────────────────────────────────────────

export function docToUser(docId: string, data: UserFirestoreDoc): User {
  const normalizedProfileImgs = Array.isArray(data['profileImgs'])
    ? (data['profileImgs'] as unknown[])
        .map((value) => toPublicStorageUrl(value))
        .filter((value): value is string => typeof value === 'string' && value.length > 0)
    : undefined;

  const normalizedPhotoUrl = toPublicStorageUrl(data['photoURL']);

  return {
    id: docId,
    ...data,
    ...(normalizedProfileImgs ? { profileImgs: normalizedProfileImgs } : {}),
    ...(normalizedPhotoUrl ? { photoURL: normalizedPhotoUrl } : {}),
  } as unknown as User;
}

export function docToUserSummary(docId: string, data: UserFirestoreDoc): UserSummary {
  const sports = Array.isArray(data['sports']) ? (data['sports'] as SportProfile[]) : undefined;
  const primarySport = sports?.find((s) => s.order === 0) ?? sports?.[0];
  const profileImgs = Array.isArray(data['profileImgs'])
    ? (data['profileImgs'] as unknown[])
        .map((value) => toPublicStorageUrl(value))
        .filter((value): value is string => typeof value === 'string' && value.length > 0)
    : undefined;

  return {
    id: docId,
    unicode: data['unicode'] as string | null | undefined,
    firstName: data['firstName'] ?? '',
    lastName: data['lastName'] ?? '',
    displayName: data['displayName'] as string | undefined,
    profileImgs,
    role: data['role'] as UserSummary['role'],
    verificationStatus: data['verificationStatus'] as UserSummary['verificationStatus'],
    location: {
      city: (data['location']?.['city'] as string | undefined) ?? data['city'] ?? '',
      state: (data['location']?.['state'] as string | undefined) ?? data['state'] ?? '',
    },
    primarySport: primarySport?.sport ?? (data['primarySport'] as string | undefined),
    primaryPosition: primarySport?.positions?.[0],
    classOf:
      (data['classOf'] as number | undefined) ??
      (data['athlete']?.['classOf'] as number | undefined),
    height:
      (data['height'] as string | undefined) ??
      (data['measurables'] as Array<{ field: string; value: string | number }> | undefined)
        ?.find((m) => m.field === 'height')
        ?.value?.toString(),
    weight:
      (data['weight'] as string | undefined) ??
      (data['measurables'] as Array<{ field: string; value: string | number }> | undefined)
        ?.find((m) => m.field === 'weight')
        ?.value?.toString(),
  };
}

// ─── Profile Hydration ───────────────────────────────────────────────────────

export function getHydrationService(db: Firestore) {
  const rosterEntryService = createRosterEntryService(db);
  const organizationService = createOrganizationService(db);
  return createProfileHydrationService(db, rosterEntryService, organizationService);
}

// ─── Team Code Generation ────────────────────────────────────────────────────

export async function generateUniqueTeamCode(db: Firestore): Promise<string> {
  for (let attempt = 0; attempt < 8; attempt++) {
    const candidate = Math.random().toString(36).substring(2, 8).toUpperCase();
    const { team } = await teamCodeService.getTeamCodeByCode(db, candidate, false);
    if (!team) {
      return candidate;
    }
  }
  return `${Date.now().toString(36).slice(-6)}`.toUpperCase();
}

// Re-export cache TTL so sub-routers don't need to import it separately
export { CACHE_TTL };
