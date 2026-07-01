import { initTargetApp, getTarget } from '../migration/migration-utils.js';

const PRESERVE_ORG_IDS = new Set<string>(['org_TImtZtIIJRl2bQuxm0Hn', '1zm2cQ5Umf1JnIvB8dlc']);
const PRESERVE_ORG_NAMES = new Set<string>(['NXT1 Seed Organization', 'Test2']);
const PRESERVE_TEAM_IDS = new Set<string>([
  'team_seed_timtztii_main',
  'M2Kj7HUbTgM5MAieBMre',
  'OoNoaPFOYJlb57TLg3Zs',
]);
const PRESERVE_TEAM_NAMES = new Set<string>(['NXT1 Seed Team', 'Test2 Football']);

function shouldPreserveOrganization(docId: string, data: FirebaseFirestore.DocumentData): boolean {
  const name = typeof data['name'] === 'string' ? data['name'].trim() : '';
  return PRESERVE_ORG_IDS.has(docId) || PRESERVE_ORG_NAMES.has(name);
}

function shouldPreserveTeam(docId: string, data: FirebaseFirestore.DocumentData): boolean {
  const teamName = typeof data['teamName'] === 'string' ? data['teamName'].trim() : '';
  const teamCode = typeof data['teamCode'] === 'string' ? data['teamCode'].trim() : '';
  const slug = typeof data['slug'] === 'string' ? data['slug'].trim() : '';

  return (
    PRESERVE_TEAM_IDS.has(docId) ||
    PRESERVE_TEAM_NAMES.has(teamName) ||
    teamCode.toUpperCase() === 'NXTSEED1' ||
    slug === 'nxt1-seed-main' ||
    slug === 'test2-football' ||
    slug === 'test2-football-2' ||
    (typeof data['organizationId'] === 'string' && PRESERVE_ORG_IDS.has(data['organizationId']))
  );
}

function hasOrphanReference(
  value: unknown,
  allowed: {
    readonly orgIds: ReadonlySet<string>;
    readonly teamIds: ReadonlySet<string>;
  },
  keyPath: readonly string[] = []
): boolean {
  if (value === null || value === undefined) {
    return false;
  }

  if (typeof value === 'string') {
    const id = value.trim();
    const key = keyPath[keyPath.length - 1] ?? '';

    if (key === 'organizationId' || key === 'organizationIds') {
      return !allowed.orgIds.has(id);
    }

    if (key === 'teamId' || key === 'teamIds') {
      return !allowed.teamIds.has(id);
    }

    if (key === 'ownerId' || key === 'ownerIds') {
      return !allowed.orgIds.has(id);
    }

    return false;
  }

  if (Array.isArray(value)) {
    return value.some((item) => hasOrphanReference(item, allowed, keyPath));
  }

  if (typeof value !== 'object') {
    return false;
  }

  for (const [nestedKey, nestedValue] of Object.entries(value as Record<string, unknown>)) {
    if (hasOrphanReference(nestedValue, allowed, [...keyPath, nestedKey])) {
      return true;
    }
  }

  return false;
}

function docReferencesOrphan(
  doc: FirebaseFirestore.DocumentData,
  allowed: {
    readonly orgIds: ReadonlySet<string>;
    readonly teamIds: ReadonlySet<string>;
  }
): boolean {
  return hasOrphanReference(doc, allowed);
}

async function main() {
  if (getTarget() !== 'staging') {
    throw new Error('This cleanup script is staging-only. Run with --target=staging');
  }

  const { db } = initTargetApp();

  const recursiveDelete = (
    db as FirebaseFirestore.Firestore & {
      recursiveDelete?: (ref: FirebaseFirestore.DocumentReference) => Promise<void>;
    }
  ).recursiveDelete;

  const deleteRecursively = async (ref: FirebaseFirestore.DocumentReference) => {
    if (typeof recursiveDelete === 'function') {
      await recursiveDelete(ref);
      return;
    }

    await ref.delete();
  };

  const organizationSnapshot = await db.collection('Organizations').get();
  const teamSnapshot = await db.collection('Teams').get();

  const preservedOrgIds = new Set<string>();
  for (const doc of organizationSnapshot.docs) {
    if (shouldPreserveOrganization(doc.id, doc.data())) {
      preservedOrgIds.add(doc.id);
    } else {
      await deleteRecursively(doc.ref);
    }
  }

  const preservedTeamIds = new Set<string>();
  for (const doc of teamSnapshot.docs) {
    if (shouldPreserveTeam(doc.id, doc.data())) {
      preservedTeamIds.add(doc.id);
    } else {
      await deleteRecursively(doc.ref);
    }
  }

  const allowedIds = {
    orgIds: preservedOrgIds,
    teamIds: preservedTeamIds,
  };

  const keepCollections = new Set(['Organizations', 'Teams', 'Users']);
  const bulkWriter = db.bulkWriter();
  const orphanDeletesByCollection = new Map<string, number>();

  for (const collection of await db.listCollections()) {
    if (keepCollections.has(collection.id)) {
      continue;
    }

    const snapshot = await collection.get();
    for (const doc of snapshot.docs) {
      const shouldDelete = (() => {
        if (collection.id === 'RosterEntries') {
          const data = doc.data();
          const teamId = typeof data['teamId'] === 'string' ? data['teamId'].trim() : '';
          return teamId !== '' && !preservedTeamIds.has(teamId);
        }

        if (collection.id === 'Wallets') {
          const data = doc.data();
          const ownerId = typeof data['ownerId'] === 'string' ? data['ownerId'].trim() : '';
          const ownerType = typeof data['ownerType'] === 'string' ? data['ownerType'].trim() : '';
          return ownerId !== '' && ownerType === 'organization' && !preservedOrgIds.has(ownerId);
        }

        if (collection.id === 'BillingPreferences' || collection.id === 'PeriodLedgers') {
          const ownerId =
            typeof doc.data()['ownerId'] === 'string' ? doc.data()['ownerId'].trim() : '';
          return ownerId !== '' && !preservedOrgIds.has(ownerId);
        }

        return docReferencesOrphan(doc.data(), allowedIds);
      })();

      if (!shouldDelete) {
        continue;
      }

      bulkWriter.delete(doc.ref);
      orphanDeletesByCollection.set(
        collection.id,
        (orphanDeletesByCollection.get(collection.id) ?? 0) + 1
      );
    }
  }

  await bulkWriter.close();

  console.log(`Cleanup complete for ${getTarget()}`);
  console.log(`Preserved orgs: ${Array.from(PRESERVE_ORG_IDS).join(', ')}`);
  console.log(`Preserved teams: ${Array.from(PRESERVE_TEAM_IDS).join(', ')}`);
  console.log(`Deleted orgs: ${organizationSnapshot.docs.length - preservedOrgIds.size}`);
  console.log(`Deleted teams: ${teamSnapshot.docs.length - preservedTeamIds.size}`);
  for (const [collectionId, count] of orphanDeletesByCollection.entries()) {
    console.log(`Deleted orphaned docs in ${collectionId}: ${count}`);
  }
}

main().catch((err) => {
  console.error('Cleanup failed:', err);
  process.exit(1);
});
