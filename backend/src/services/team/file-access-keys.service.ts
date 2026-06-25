import type { Firestore } from 'firebase-admin/firestore';

export interface FileAccessContext {
  readonly userId: string;
  readonly teamIds: readonly string[];
  readonly organizationIds: readonly string[];
}

export interface FileAccessLists {
  readonly readAccessKeys: readonly string[];
  readonly writeAccessKeys: readonly string[];
}

function normalizeId(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

function unique(values: readonly (string | null | undefined)[]): string[] {
  const result = new Set<string>();
  for (const value of values) {
    if (typeof value === 'string' && value.trim().length > 0) {
      result.add(value.trim());
    }
  }
  return [...result];
}

export function toUserAccessKey(userId: string): string {
  return `user:${userId}`;
}

export function toTeamAccessKey(teamId: string): string {
  return `team:${teamId}`;
}

export function toOrganizationAccessKey(organizationId: string): string {
  return `org:${organizationId}`;
}

export function createOwnerScopedAccessLists(input: {
  readonly ownerUserId: string;
  readonly teamId?: string | null;
  readonly organizationId?: string | null;
}): FileAccessLists {
  const ownerKey = toUserAccessKey(input.ownerUserId);
  const teamId = normalizeId(input.teamId);
  const organizationId = normalizeId(input.organizationId);

  return {
    readAccessKeys: unique([
      ownerKey,
      teamId ? toTeamAccessKey(teamId) : null,
      organizationId ? toOrganizationAccessKey(organizationId) : null,
    ]),
    writeAccessKeys: unique([ownerKey]),
  };
}

export function createOwnerPrivateAccessLists(input: {
  readonly ownerUserId: string;
}): FileAccessLists {
  const ownerKey = toUserAccessKey(input.ownerUserId);

  return {
    readAccessKeys: unique([ownerKey]),
    writeAccessKeys: unique([ownerKey]),
  };
}

export function canAccessByKeys(
  candidateKeys: readonly string[],
  grantedKeys: readonly string[]
): boolean {
  if (candidateKeys.length === 0 || grantedKeys.length === 0) {
    return false;
  }

  const granted = new Set(grantedKeys);
  return candidateKeys.some((key) => granted.has(key));
}

export async function resolveFileAccessContext(
  db: Firestore,
  userId: string
): Promise<FileAccessContext> {
  const rosterSnapshot = await db
    .collection('RosterEntries')
    .where('userId', '==', userId)
    .limit(250)
    .get();

  const teamIds = new Set<string>();
  const organizationIds = new Set<string>();

  for (const doc of rosterSnapshot.docs) {
    const data = doc.data() as Record<string, unknown>;
    const status = typeof data['status'] === 'string' ? data['status'].trim().toLowerCase() : '';
    if (status && status !== 'active' && status !== 'pending') {
      continue;
    }

    const teamId = normalizeId(data['teamId']);
    if (teamId) {
      teamIds.add(teamId);
    }

    const organizationId = normalizeId(data['organizationId']);
    if (organizationId) {
      organizationIds.add(organizationId);
    }
  }

  return {
    userId,
    teamIds: [...teamIds],
    organizationIds: [...organizationIds],
  };
}

export function buildGrantedAccessKeys(context: FileAccessContext): string[] {
  return unique([
    toUserAccessKey(context.userId),
    ...context.teamIds.map((teamId) => toTeamAccessKey(teamId)),
    ...context.organizationIds.map((organizationId) => toOrganizationAccessKey(organizationId)),
  ]);
}
