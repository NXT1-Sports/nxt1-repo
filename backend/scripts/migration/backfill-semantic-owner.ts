import 'dotenv/config';
import { getFirestore } from 'firebase-admin/firestore';
import '../../src/utils/firebase.js'; // Just import to auto-initialize
import { connectToMongoDB, disconnectFromMongoDB } from '../../src/config/database.config.js';
import { TeamUniversalFileSemanticModel } from '../../src/modules/agent/memory/team-universal-file-semantic.model.js';

async function run() {
  await connectToMongoDB();
  const db = getFirestore();

  console.log('Fetching missing chunks...');
  const chunks = await TeamUniversalFileSemanticModel.find({
    $or: [{ ownerUserId: { $exists: false } }, { ownerUserId: '' }],
  });
  console.log(`Found ${chunks.length} chunks missing ownerUserId.`);

  if (chunks.length === 0) {
    console.log('Finished. No updates needed.');
    await disconnectFromMongoDB();
    process.exit(0);
  }

  const cache = new Map<string, string>();

  let updated = 0;
  for (const chunk of chunks) {
    let ownerId = cache.get(chunk.fileId);
    if (!ownerId) {
      const doc = await db.collection('UniversalFiles').doc(chunk.fileId).get();
      if (doc.exists) {
        const data = doc.data();
        ownerId = data?.ownerUserId || data?.createdByUserId || 'unknown';
        cache.set(chunk.fileId, ownerId);
      } else {
        cache.set(chunk.fileId, 'unknown');
        ownerId = 'unknown';
      }
    }

    chunk.ownerUserId = ownerId;
    if (!chunk.teamId) {
      chunk.teamId = ''; // Ensure blank string, not undefined
    }
    await chunk.save();
    updated++;

    if (updated % 50 === 0) {
      console.log(`Updated ${updated}/${chunks.length}`);
    }
  }

  console.log(`Finished. Updated ${updated} chunks.`);
  await disconnectFromMongoDB();
  process.exit(0);
}

run().catch(console.error);
