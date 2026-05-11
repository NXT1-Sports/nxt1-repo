import type { Firestore } from 'firebase-admin/firestore';
import { db } from '../../../../../utils/firebase.js';
import { stagingDb } from '../../../../../utils/firebase-staging.js';
import {
  OutstandSocialAccountSchema,
  type OutstandSocialAccount,
  type OutstandSocialPlatform,
} from './schemas.js';

interface StoredConnectedSocialAccountInput {
  outstandAccountId?: unknown;
  username?: unknown;
  displayName?: unknown;
  profileUrl?: unknown;
  followerCount?: unknown;
  connectedAt?: unknown;
  lastSyncedAt?: unknown;
  isActive?: unknown;
  network?: unknown;
  platform?: unknown;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function toStringOrUndefined(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
}

function toNumberOrUndefined(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return undefined;
}

function toIsoDateOrUndefined(value: unknown): string | undefined {
  if (typeof value === 'string') {
    const date = new Date(value);
    if (!Number.isNaN(date.getTime())) {
      return date.toISOString();
    }
  }

  return undefined;
}

function toBooleanOrDefault(value: unknown, fallback: boolean): boolean {
  if (typeof value === 'boolean') return value;
  return fallback;
}

function normalizeStoredAccount(
  platform: OutstandSocialPlatform,
  raw: StoredConnectedSocialAccountInput
): OutstandSocialAccount | null {
  const accountId = toStringOrUndefined(raw.outstandAccountId);
  const username = toStringOrUndefined(raw.username);

  if (!accountId || !username) {
    return null;
  }

  const parsed = OutstandSocialAccountSchema.safeParse({
    id: accountId,
    network: platform,
    username,
    displayName: toStringOrUndefined(raw.displayName),
    profileUrl: toStringOrUndefined(raw.profileUrl),
    followerCount: toNumberOrUndefined(raw.followerCount),
    connectedAt: toIsoDateOrUndefined(raw.connectedAt),
    isActive: toBooleanOrDefault(raw.isActive, true),
  });

  return parsed.success ? parsed.data : null;
}

export function getFirestoreByEnvironment(environment?: 'staging' | 'production'): Firestore {
  return environment === 'staging' ? stagingDb : db;
}

export async function listUserConnectedSocialAccounts(
  userId: string,
  environment?: 'staging' | 'production'
): Promise<OutstandSocialAccount[]> {
  const firestore = getFirestoreByEnvironment(environment);
  const snapshot = await firestore.collection('Users').doc(userId).get();

  if (!snapshot.exists) {
    return [];
  }

  const data = snapshot.data();
  const connected = asRecord(data?.['connectedSocialAccounts']);

  if (!connected) {
    return [];
  }

  const accounts: OutstandSocialAccount[] = [];

  for (const [platformKey, rawValue] of Object.entries(connected)) {
    if (!['x', 'instagram', 'youtube', 'tiktok'].includes(platformKey)) {
      continue;
    }

    const rawRecord = asRecord(rawValue);
    if (!rawRecord) continue;

    const normalized = normalizeStoredAccount(
      platformKey as OutstandSocialPlatform,
      rawRecord as StoredConnectedSocialAccountInput
    );

    if (normalized) {
      accounts.push(normalized);
    }
  }

  return accounts;
}

export async function getUserConnectedSocialAccountsByPlatform(
  userId: string,
  platforms: readonly OutstandSocialPlatform[],
  environment?: 'staging' | 'production'
): Promise<Record<OutstandSocialPlatform, OutstandSocialAccount | null>> {
  const all = await listUserConnectedSocialAccounts(userId, environment);

  const lookup = new Map<OutstandSocialPlatform, OutstandSocialAccount>(
    all.map((account) => [account.network, account])
  );

  const result = {} as Record<OutstandSocialPlatform, OutstandSocialAccount | null>;
  for (const platform of platforms) {
    result[platform] = lookup.get(platform) ?? null;
  }

  return result;
}
