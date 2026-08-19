/**
 * @fileoverview Authorization scope for read-only platform data tools.
 *
 * `query_nxt1_platform_data` scans raw Firestore collections, so it must resolve
 * the caller's team/organization membership before returning any team-private
 * record. Without this gate any authenticated user could read another program's
 * roster, schedule, stats, playbooks, and Team Files by guessing a `teamId`.
 */
import type { Firestore } from 'firebase-admin/firestore';
import { RosterEntryStatus } from '@nxt1/core/models';

const ROSTER_ENTRIES_COLLECTION = 'RosterEntries';
const TEAMS_COLLECTION = 'Teams';
const ORGANIZATIONS_COLLECTION = 'Organizations';
const FIRESTORE_IN_QUERY_CHUNK_SIZE = 10;

export interface PlatformAccessScope {
  readonly userId: string;
  readonly teamIds: readonly string[];
  readonly organizationIds: readonly string[];
  /** Internal NXT1 operator allowed to run unrestricted platform-wide analytics. */
  readonly isPlatformAdmin: boolean;
}

export type PlatformAccessScopeResolver = (
  db: Firestore,
  userId: string
) => Promise<PlatformAccessScope>;

function uniqueSorted(values: readonly (string | undefined | null)[]): string[] {
  return [
    ...new Set(
      values.filter(
        (value): value is string => typeof value === 'string' && value.trim().length > 0
      )
    ),
  ].sort((left, right) => left.localeCompare(right));
}

function chunkValues(values: readonly string[], chunkSize: number): string[][] {
  const chunks: string[][] = [];
  for (let index = 0; index < values.length; index += chunkSize) {
    chunks.push(values.slice(index, index + chunkSize));
  }
  return chunks;
}

export function isPlatformDataAdmin(userId: string): boolean {
  const configured = process.env['NXT1_PLATFORM_DATA_ADMIN_USER_IDS'];
  if (!configured) {
    return false;
  }

  return configured
    .split(',')
    .map((value) => value.trim())
    .filter((value) => value.length > 0)
    .includes(userId);
}

export function createEmptyPlatformAccessScope(userId: string): PlatformAccessScope {
  return {
    userId,
    teamIds: [],
    organizationIds: [],
    isPlatformAdmin: isPlatformDataAdmin(userId),
  };
}

/**
 * Resolves every team and organization the caller legitimately belongs to:
 * active/pending roster memberships, teams they own or administer, organizations
 * they own, and all teams under those organizations.
 */
export async function resolvePlatformAccessScope(
  db: Firestore,
  userId: string
): Promise<PlatformAccessScope> {
  const [rosterSnapshot, teamOwnerSnapshot, teamAdminSnapshot, organizationOwnerSnapshot] =
    await Promise.all([
      db
        .collection(ROSTER_ENTRIES_COLLECTION)
        .where('userId', '==', userId)
        .where('status', 'in', [RosterEntryStatus.ACTIVE, RosterEntryStatus.PENDING])
        .get(),
      db.collection(TEAMS_COLLECTION).where('ownerId', '==', userId).get(),
      db.collection(TEAMS_COLLECTION).where('adminIds', 'array-contains', userId).get(),
      db.collection(ORGANIZATIONS_COLLECTION).where('ownerId', '==', userId).get(),
    ]);

  const managedTeamDocs = new Map<string, Record<string, unknown>>();
  for (const doc of [...teamOwnerSnapshot.docs, ...teamAdminSnapshot.docs]) {
    managedTeamDocs.set(doc.id, (doc.data() ?? {}) as Record<string, unknown>);
  }

  const rosterTeamIds = rosterSnapshot.docs.map(
    (doc) => (doc.data() as Record<string, unknown>)['teamId'] as string | undefined
  );
  const rosterOrganizationIds = rosterSnapshot.docs.map(
    (doc) => (doc.data() as Record<string, unknown>)['organizationId'] as string | undefined
  );

  const ownedOrganizationIds = organizationOwnerSnapshot.docs.map((doc) => doc.id);

  // Org owners implicitly administer every team under the organization.
  if (ownedOrganizationIds.length > 0) {
    const orgTeamSnapshots = await Promise.all(
      chunkValues(ownedOrganizationIds, FIRESTORE_IN_QUERY_CHUNK_SIZE).map((organizationIds) =>
        db.collection(TEAMS_COLLECTION).where('organizationId', 'in', organizationIds).get()
      )
    );

    for (const doc of orgTeamSnapshots.flatMap((snapshot) => snapshot.docs)) {
      managedTeamDocs.set(doc.id, (doc.data() ?? {}) as Record<string, unknown>);
    }
  }

  const managedTeamOrganizationIds = [...managedTeamDocs.values()].map(
    (teamData) => teamData['organizationId'] as string | undefined
  );

  return {
    userId,
    teamIds: uniqueSorted([...rosterTeamIds, ...managedTeamDocs.keys()]),
    organizationIds: uniqueSorted([
      ...rosterOrganizationIds,
      ...managedTeamOrganizationIds,
      ...ownedOrganizationIds,
    ]),
    isPlatformAdmin: isPlatformDataAdmin(userId),
  };
}
