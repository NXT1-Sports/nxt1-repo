#!/usr/bin/env tsx
import 'dotenv/config';
import {
  connectToMongoDB,
  disconnectFromMongoDB,
  getMongoGlobalConnection,
} from '../../src/config/database.config.js';
import {
  TEAM_UNIVERSAL_FILE_SEMANTIC_COLLECTION_NAME,
  TEAM_UNIVERSAL_FILE_SEMANTIC_VECTOR_INDEX_DEFINITION,
  TEAM_UNIVERSAL_FILE_SEMANTIC_VECTOR_INDEX_NAME,
} from '../../src/modules/agent/memory/team-universal-file-semantic.model.js';

const dryRun = process.argv.includes('--dry-run');

async function main(): Promise<void> {
  console.log('');
  console.log('═══════════════════════════════════════════════════');
  console.log('  Universal File Semantic Index');
  console.log(`  Mode: ${dryRun ? 'DRY RUN' : 'APPLY'}`);
  console.log('═══════════════════════════════════════════════════');
  console.log('');

  await connectToMongoDB();
  const connection = getMongoGlobalConnection();
  const collection = connection.collection(TEAM_UNIVERSAL_FILE_SEMANTIC_COLLECTION_NAME) as {
    listSearchIndexes?: () => { toArray: () => Promise<Array<{ name?: string }>> };
  };

  const existingNames =
    typeof collection.listSearchIndexes === 'function'
      ? new Set(
          (await collection.listSearchIndexes().toArray())
            .map((item) => item.name)
            .filter((value): value is string => typeof value === 'string' && value.length > 0)
        )
      : new Set<string>();

  const alreadyExists = existingNames.has(TEAM_UNIVERSAL_FILE_SEMANTIC_VECTOR_INDEX_NAME);
  console.log(`collection: ${TEAM_UNIVERSAL_FILE_SEMANTIC_COLLECTION_NAME}`);
  console.log(`index:      ${TEAM_UNIVERSAL_FILE_SEMANTIC_VECTOR_INDEX_NAME}`);
  console.log(`exists:     ${alreadyExists ? 'yes' : 'no'}`);

  if (dryRun || alreadyExists) {
    return;
  }

  await connection.db.command({
    createSearchIndexes: TEAM_UNIVERSAL_FILE_SEMANTIC_COLLECTION_NAME,
    indexes: [
      {
        name: TEAM_UNIVERSAL_FILE_SEMANTIC_VECTOR_INDEX_NAME,
        type: 'vectorSearch',
        definition: TEAM_UNIVERSAL_FILE_SEMANTIC_VECTOR_INDEX_DEFINITION,
      },
    ],
  });

  console.log('index_created: yes');
}

main()
  .catch((error) => {
    console.error(
      'ensure_universal_file_semantic_index_failed',
      error instanceof Error ? error.message : String(error)
    );
    process.exitCode = 1;
  })
  .finally(async () => {
    await disconnectFromMongoDB().catch(() => undefined);
  });
