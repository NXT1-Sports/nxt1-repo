import 'dotenv/config';
import mongoose from 'mongoose';

type SearchIndexDefinition = {
  readonly name?: string;
  readonly type?: string;
  readonly definition?: Record<string, unknown>;
  readonly latestDefinition?: Record<string, unknown>;
};

const SOURCE_DB = getArgValue('--source') ?? 'nxt';
const STAGING_DB =
  getArgValue('--staging') ?? process.env['MONGO_DB_NAME_STAGING'] ?? 'nxt_staging';
const PRODUCTION_DB =
  getArgValue('--production') ?? process.env['MONGO_DB_NAME_PRODUCTION'] ?? 'nxt_production';
const DROP_SOURCE = !process.argv.includes('--keep-source');

const EXCLUDED_COLLECTIONS = new Set(['colleges', 'contacts', '_envBootstrap']);
const ENV_STAMPED_COLLECTIONS = new Set([
  'analyticsEvents',
  'analyticsRollups',
  'syncDeltaEvents',
  'customAnalytics',
]);
const SEARCH_INDEXED_COLLECTIONS = new Set([
  'agentglobalknowledges',
  'agentmemories',
  'agentsemanticcaches',
]);

async function main(): Promise<void> {
  const uri = process.env['MONGO'];
  if (!uri) {
    throw new Error('MONGO environment variable is not set');
  }

  await mongoose.connect(uri);
  const client = mongoose.connection.getClient();
  const sourceDb = client.db(SOURCE_DB);
  const stagingDb = client.db(STAGING_DB);
  const productionDb = client.db(PRODUCTION_DB);

  const sourceCollections = await sourceDb.listCollections({}, { nameOnly: false }).toArray();
  const movable = sourceCollections
    .map((entry) => entry.name)
    .filter((name) => !name.startsWith('system.'))
    .filter((name) => !EXCLUDED_COLLECTIONS.has(name))
    .sort();

  console.log(`source_db ${SOURCE_DB}`);
  console.log(`staging_db ${STAGING_DB}`);
  console.log(`production_db ${PRODUCTION_DB}`);
  console.log(`collections_to_move ${movable.join(', ')}`);

  for (const name of movable) {
    const sourceInfo = await sourceDb.listCollections({ name }, { nameOnly: false }).next();
    if (!sourceInfo) continue;

    await recreateCollectionFromSource(stagingDb, sourceInfo, { dropIfExists: false });
    await recreateCollectionFromSource(productionDb, sourceInfo, { dropIfExists: false });

    await cloneIndexes(sourceDb, stagingDb, name);
    await cloneIndexes(sourceDb, productionDb, name);

    if (SEARCH_INDEXED_COLLECTIONS.has(name)) {
      await cloneSearchIndexes(sourceDb, stagingDb, name);
      await cloneSearchIndexes(sourceDb, productionDb, name);
    }

    const copied = await copyDocuments(sourceDb, stagingDb, name, 'staging');
    const sourceCount = await sourceDb.collection(name).countDocuments();
    const stagingCount = await stagingDb.collection(name).countDocuments();

    if (stagingCount < sourceCount) {
      throw new Error(`count mismatch for ${name}: source=${sourceCount} staging=${stagingCount}`);
    }

    console.log(`migrated ${name} copied=${copied} verified=${stagingCount}`);
  }

  await ensureRequiredVectorIndexes(stagingDb);
  await ensureRequiredVectorIndexes(productionDb);

  if (DROP_SOURCE) {
    for (const name of movable) {
      const exists = await sourceDb.listCollections({ name } as any).hasNext();
      if (!exists) continue;
      await sourceDb.collection(name).drop();
      console.log(`dropped_source_collection ${name}`);
    }
  }

  await (stagingDb.collection('_envBootstrap') as any).updateOne(
    { _id: 'bootstrap' },
    { $set: { dbName: STAGING_DB, environment: 'staging', migratedAt: new Date() } },
    { upsert: true }
  );
  await (productionDb.collection('_envBootstrap') as any).updateOne(
    { _id: 'bootstrap' },
    { $set: { dbName: PRODUCTION_DB, environment: 'production', preparedAt: new Date() } },
    { upsert: true }
  );

  console.log('migration_complete true');

  await mongoose.disconnect();
}

async function recreateCollectionFromSource(
  targetDb: mongoose.mongo.Db,
  sourceInfo: Record<string, any>,
  options: { dropIfExists?: boolean } = {}
): Promise<void> {
  const name = String(sourceInfo.name);
  const dropIfExists = options.dropIfExists ?? true;
  const exists = await targetDb.listCollections({ name } as any).hasNext();

  if (exists && dropIfExists) {
    await targetDb
      .collection(name)
      .drop()
      .catch(() => undefined);
  }

  const existsAfterDrop = await targetDb.listCollections({ name } as any).hasNext();
  if (existsAfterDrop) return;

  const createOptions: Record<string, unknown> = {};
  const rawOptions = (sourceInfo.options ?? {}) as Record<string, unknown>;

  if (rawOptions['timeseries']) createOptions['timeseries'] = rawOptions['timeseries'];
  if (typeof rawOptions['expireAfterSeconds'] === 'number') {
    createOptions['expireAfterSeconds'] = rawOptions['expireAfterSeconds'];
  }
  if (typeof rawOptions['capped'] === 'boolean') createOptions['capped'] = rawOptions['capped'];
  if (typeof rawOptions['size'] === 'number') createOptions['size'] = rawOptions['size'];
  if (typeof rawOptions['max'] === 'number') createOptions['max'] = rawOptions['max'];

  await targetDb.createCollection(name, createOptions);
}

async function cloneIndexes(
  sourceDb: mongoose.mongo.Db,
  targetDb: mongoose.mongo.Db,
  name: string
): Promise<void> {
  const indexes = await sourceDb.collection(name).indexes();

  for (const index of indexes) {
    if (index.name === '_id_') continue;

    const { key, name: indexName, v: _v, ns: _ns, background: _background, ...rest } = index;
    try {
      await targetDb.collection(name).createIndex(key, {
        name: indexName,
        ...rest,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (!message.toLowerCase().includes('already exists')) {
        console.warn(`index_copy_warning ${name} ${indexName} ${message}`);
      }
    }
  }
}

async function cloneSearchIndexes(
  sourceDb: mongoose.mongo.Db,
  targetDb: mongoose.mongo.Db,
  name: string
): Promise<void> {
  try {
    const sourceCollection = sourceDb.collection(name) as any;
    const targetCollection = targetDb.collection(name) as any;

    if (typeof sourceCollection.listSearchIndexes !== 'function') {
      return;
    }

    const searchIndexes = (await sourceCollection.listSearchIndexes().toArray()) as any[];
    if (!searchIndexes.length) return;

    const existingNames =
      typeof targetCollection.listSearchIndexes === 'function'
        ? new Set(
            ((await targetCollection.listSearchIndexes().toArray()) as any[])
              .map((item: any) => item.name)
              .filter((value): value is string => typeof value === 'string' && value.length > 0)
          )
        : new Set<string>();

    const indexesToCreate = searchIndexes
      .map((item: any) => ({
        name: item.name,
        type: item.type ?? inferSearchIndexType(item.latestDefinition ?? item.definition),
        definition: item.latestDefinition ?? item.definition,
      }))
      .filter(
        (item: any) =>
          typeof item.name === 'string' &&
          item.name.length > 0 &&
          !!item.definition &&
          !existingNames.has(item.name)
      ) as Array<{ name: string; type?: string; definition: Record<string, unknown> }>;

    if (!indexesToCreate.length) return;

    await targetDb.command({
      createSearchIndexes: name,
      indexes: indexesToCreate,
    });

    console.log(
      `search_indexes_cloned ${name} ${indexesToCreate.map((item) => item.name).join(',')}`
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`search_index_copy_warning ${name} ${message}`);
  }
}

async function copyDocuments(
  sourceDb: mongoose.mongo.Db,
  targetDb: mongoose.mongo.Db,
  name: string,
  environment: 'staging' | 'production'
): Promise<number> {
  const cursor = sourceDb.collection(name).find({});
  let copied = 0;
  let batch: Record<string, unknown>[] = [];

  for await (const document of cursor) {
    batch.push(transformDocument(name, document, environment));
    if (batch.length >= 500) {
      await upsertBatch(targetDb, name, batch);
      copied += batch.length;
      batch = [];
    }
  }

  if (batch.length > 0) {
    await upsertBatch(targetDb, name, batch);
    copied += batch.length;
  }

  return copied;
}

async function upsertBatch(
  targetDb: mongoose.mongo.Db,
  name: string,
  batch: Record<string, unknown>[]
): Promise<void> {
  const operations = batch.map((document) => ({
    replaceOne: {
      filter: { _id: document['_id'] as any },
      replacement: document,
      upsert: true,
    },
  })) as any;

  await (targetDb.collection(name) as any).bulkWrite(operations, { ordered: false });
}

function transformDocument(
  name: string,
  document: Record<string, unknown>,
  environment: 'staging' | 'production'
): Record<string, unknown> {
  if (!ENV_STAMPED_COLLECTIONS.has(name)) {
    return document;
  }

  const cloned = { ...(document as Record<string, unknown>) } as Record<string, unknown>;
  cloned['environment'] = environment;

  if (typeof cloned['meta'] === 'object' && cloned['meta'] !== null) {
    cloned['meta'] = {
      ...(cloned['meta'] as Record<string, unknown>),
      environment,
    };
  }

  if (typeof cloned['metadata'] === 'object' && cloned['metadata'] !== null) {
    cloned['metadata'] = {
      ...(cloned['metadata'] as Record<string, unknown>),
      environment,
    };
  }

  return cloned;
}

async function ensureRequiredVectorIndexes(targetDb: mongoose.mongo.Db): Promise<void> {
  const indexSpecs = [
    {
      collectionName: 'agentmemories',
      indexName: 'agent_memory_vector_index',
      definition: {
        fields: [
          { type: 'vector', path: 'embedding', numDimensions: 1536, similarity: 'cosine' },
          { type: 'filter', path: 'userId' },
          { type: 'filter', path: 'category' },
        ],
      },
    },
    {
      collectionName: 'agentsemanticcaches',
      indexName: 'agent_semantic_cache_vector_index',
      definition: {
        fields: [{ type: 'vector', path: 'embedding', numDimensions: 1536, similarity: 'cosine' }],
      },
    },
    {
      collectionName: 'agentglobalknowledges',
      indexName: 'agent_global_knowledge_vector_index',
      definition: {
        fields: [
          { type: 'vector', path: 'embedding', numDimensions: 1536, similarity: 'cosine' },
          { type: 'filter', path: 'category' },
          { type: 'filter', path: 'version' },
        ],
      },
    },
  ] as const;

  for (const spec of indexSpecs) {
    try {
      const collection = targetDb.collection(spec.collectionName) as any;
      const existing =
        typeof collection.listSearchIndexes === 'function'
          ? ((await collection.listSearchIndexes().toArray()) as SearchIndexDefinition[])
          : [];

      if (existing.some((item) => item.name === spec.indexName)) {
        continue;
      }

      await targetDb.command({
        createSearchIndexes: spec.collectionName,
        indexes: [
          {
            name: spec.indexName,
            type: 'vectorSearch',
            definition: spec.definition,
          },
        ],
      });

      console.log(`required_vector_index_created ${spec.collectionName} ${spec.indexName}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (!message.toLowerCase().includes('already exists')) {
        console.warn(`required_vector_index_warning ${spec.collectionName} ${message}`);
      }
    }
  }
}

function inferSearchIndexType(definition: Record<string, unknown> | undefined): string | undefined {
  const fields = definition?.['fields'];
  return Array.isArray(fields) ? 'vectorSearch' : undefined;
}

function getArgValue(flag: string): string | undefined {
  const entry = process.argv.find((arg) => arg.startsWith(`${flag}=`));
  return entry ? entry.slice(flag.length + 1) : undefined;
}

main().catch(async (error) => {
  console.error('migration_failed', error instanceof Error ? error.message : String(error));
  await mongoose.disconnect().catch(() => undefined);
  process.exitCode = 1;
});
