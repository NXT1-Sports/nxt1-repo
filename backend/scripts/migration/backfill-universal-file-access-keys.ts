import { initializeApp, applicationDefault } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { createOwnerScopedAccessLists } from '../../src/services/team/file-access-keys.service.js';

const app = initializeApp({ credential: applicationDefault() });
const db = getFirestore(app);

async function backfillCollection(collectionName: string): Promise<number> {
  const snapshot = await db.collection(collectionName).limit(500).get();
  let updatedCount = 0;

  for (const doc of snapshot.docs) {
    const data = doc.data() as Record<string, unknown>;
    const ownerUserId =
      typeof data['ownerUserId'] === 'string' && data['ownerUserId'].trim().length > 0
        ? data['ownerUserId'].trim()
        : typeof data['createdByUserId'] === 'string' && data['createdByUserId'].trim().length > 0
          ? data['createdByUserId'].trim()
          : null;

    if (!ownerUserId) {
      continue;
    }

    const accessLists = createOwnerScopedAccessLists({
      ownerUserId,
      teamId: typeof data['teamId'] === 'string' ? data['teamId'] : null,
      organizationId: typeof data['organizationId'] === 'string' ? data['organizationId'] : null,
    });

    await doc.ref.set(
      {
        ownerUserId,
        readAccessKeys: accessLists.readAccessKeys,
        writeAccessKeys: accessLists.writeAccessKeys,
      },
      { merge: true }
    );

    updatedCount += 1;
  }

  return updatedCount;
}

async function main(): Promise<void> {
  const [filesUpdated, foldersUpdated] = await Promise.all([
    backfillCollection('UniversalFiles'),
    backfillCollection('TeamFileFolders'),
  ]);

  console.log(
    JSON.stringify(
      {
        success: true,
        filesUpdated,
        foldersUpdated,
      },
      null,
      2
    )
  );
}

void main().catch((error) => {
  console.error(
    JSON.stringify(
      {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      },
      null,
      2
    )
  );
  process.exitCode = 1;
});
