#!/usr/bin/env tsx
import 'dotenv/config';

import { MongoClient, ObjectId, type Collection, type Db, type Document } from 'mongodb';

const GLOBAL_DB_FALLBACK = 'nxt';
const HELP_ARTICLE_COLLECTION = 'helparticles';
const GLOBAL_SEMANTIC_COLLECTION = 'agentTeamUniversalFileSemantic';
const EMPTY_GLOBAL_COLLECTION_CANDIDATES = [
  'paymentlogs',
  'usageevents',
  'agentmessages',
  'agentthreads',
] as const;

interface HelpArticleDoc extends Document {
  _id: ObjectId;
  slug?: string;
  legacySlugs?: unknown;
  title?: string;
  category?: string;
  tags?: unknown;
  targetUsers?: unknown;
  relatedContent?: unknown;
  viewCount?: unknown;
  helpfulCount?: unknown;
  notHelpfulCount?: unknown;
  isFeatured?: unknown;
  isNew?: unknown;
  isPublished?: unknown;
  publishedAt?: unknown;
  updatedAt?: unknown;
  lastAgentRefresh?: unknown;
}

interface HelpArticleDuplicateGroup {
  readonly category: string;
  readonly normalizedTitle: string;
  readonly ids: readonly ObjectId[];
  readonly count: number;
}

interface SemanticChunkDoc extends Document {
  _id: ObjectId;
  fileId?: string;
  version?: number;
  chunkIndex?: number;
  ownerUserId?: string;
  teamId?: string;
  contentHash?: string;
  createdAt?: string;
}

interface SemanticResiduePlan {
  readonly mirrored: readonly SemanticChunkDoc[];
  readonly unmatched: readonly SemanticChunkDoc[];
}

const args = process.argv.slice(2);

function hasFlag(flag: string): boolean {
  return args.includes(flag);
}

function getArg(name: string): string | null {
  return (
    args
      .find((arg) => arg.startsWith(`--${name}=`))
      ?.split('=')
      .slice(1)
      .join('=') ?? null
  );
}

function resolveMongoUri(): string {
  const uri =
    process.env['MONGO'] ??
    process.env['MONGO_URI'] ??
    process.env['MONGODB_URI'] ??
    process.env['MONGODB_URL'];

  if (!uri?.trim()) {
    throw new Error('Missing Mongo URI. Set MONGO (or MONGO_URI / MONGODB_URI / MONGODB_URL).');
  }

  return uri;
}

function resolveDbNames(): { global: string; staging: string; production: string } {
  const explicitGlobal = getArg('global-db')?.trim() || process.env['MONGO_DB_NAME_GLOBAL']?.trim();
  const global = explicitGlobal || GLOBAL_DB_FALLBACK;
  return {
    global,
    staging: process.env['MONGO_DB_NAME_STAGING']?.trim() || `${global}_staging`,
    production: process.env['MONGO_DB_NAME_PRODUCTION']?.trim() || `${global}_production`,
  };
}

function toNumber(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function toIsoStringOrNull(value: unknown): string | null {
  if (typeof value === 'string' && value.trim()) return value;
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString();
  return null;
}

function toDateOrNull(value: unknown): Date | null {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
  if (typeof value === 'string' && value.trim()) {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  return null;
}

function uniqueStrings(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [
    ...new Set(value.filter((entry): entry is string => typeof entry === 'string' && entry.trim())),
  ];
}

function uniqueSlugList(values: Iterable<string | undefined>): string[] {
  return [
    ...new Set(
      [...values].filter((value): value is string => typeof value === 'string' && value.trim())
    ),
  ];
}

function uniqueRelatedContent(value: unknown): Record<string, unknown>[] {
  if (!Array.isArray(value)) return [];

  const map = new Map<string, Record<string, unknown>>();
  for (const entry of value) {
    if (!entry || typeof entry !== 'object') continue;
    const record = entry as Record<string, unknown>;
    const key = JSON.stringify([
      typeof record['id'] === 'string' ? record['id'] : '',
      typeof record['type'] === 'string' ? record['type'] : '',
      typeof record['title'] === 'string' ? record['title'] : '',
      typeof record['category'] === 'string' ? record['category'] : '',
    ]);
    if (!map.has(key)) {
      map.set(key, record);
    }
  }

  return [...map.values()];
}

function chooseHelpArticleKeeper(documents: readonly HelpArticleDoc[]): HelpArticleDoc {
  return [...documents].sort(
    (left, right) => left._id.getTimestamp().getTime() - right._id.getTimestamp().getTime()
  )[0]!;
}

function buildSemanticKey(
  doc: Pick<SemanticChunkDoc, 'fileId' | 'version' | 'chunkIndex'>
): string | null {
  if (!doc.fileId || typeof doc.version !== 'number' || typeof doc.chunkIndex !== 'number') {
    return null;
  }
  return `${doc.fileId}::${doc.version}::${doc.chunkIndex}`;
}

async function findHelpArticleDuplicateGroups(
  collection: Collection<HelpArticleDoc>
): Promise<readonly HelpArticleDuplicateGroup[]> {
  const groups = await collection
    .aggregate<HelpArticleDuplicateGroup>([
      {
        $group: {
          _id: {
            category: '$category',
            normalizedTitle: {
              $toLower: {
                $trim: { input: '$title' },
              },
            },
          },
          ids: { $push: '$_id' },
          count: { $sum: 1 },
        },
      },
      { $match: { count: { $gt: 1 } } },
      { $sort: { count: -1, '_id.category': 1, '_id.normalizedTitle': 1 } },
      {
        $project: {
          _id: 0,
          category: '$_id.category',
          normalizedTitle: '$_id.normalizedTitle',
          ids: 1,
          count: 1,
        },
      },
    ])
    .toArray();

  return groups;
}

async function cleanupHelpArticleDuplicates(
  collection: Collection<HelpArticleDoc>,
  commit: boolean
): Promise<void> {
  const groups = await findHelpArticleDuplicateGroups(collection);

  console.log(`Help article duplicate groups: ${groups.length}`);
  if (groups.length === 0) {
    return;
  }

  for (const group of groups) {
    const documents = await collection.find({ _id: { $in: [...group.ids] } }).toArray();

    if (documents.length < 2) continue;

    const keeper = chooseHelpArticleKeeper(documents);
    const duplicates = documents.filter((doc) => !doc._id.equals(keeper._id));
    const mergedViewCount = documents.reduce((sum, doc) => sum + toNumber(doc.viewCount), 0);
    const mergedHelpfulCount = documents.reduce((sum, doc) => sum + toNumber(doc.helpfulCount), 0);
    const mergedNotHelpfulCount = documents.reduce(
      (sum, doc) => sum + toNumber(doc.notHelpfulCount),
      0
    );
    const mergedTags = [...new Set(documents.flatMap((doc) => uniqueStrings(doc.tags)))];
    const mergedTargetUsers = [
      ...new Set(documents.flatMap((doc) => uniqueStrings(doc.targetUsers))),
    ];
    const mergedLegacySlugs = uniqueSlugList([
      ...documents.flatMap((doc) => uniqueStrings(doc.legacySlugs)),
      ...duplicates.map((doc) => doc.slug),
    ]).filter((value) => value !== keeper.slug);
    const mergedRelatedContent = uniqueRelatedContent(
      documents.flatMap((doc) => (Array.isArray(doc.relatedContent) ? doc.relatedContent : []))
    );
    const mergedPublishedAt =
      [...documents]
        .map((doc) => toIsoStringOrNull(doc.publishedAt))
        .filter((value): value is string => value !== null)
        .sort()[0] ?? toIsoStringOrNull(keeper.publishedAt);
    const mergedUpdatedAt =
      [...documents]
        .map((doc) => toIsoStringOrNull(doc.updatedAt))
        .filter((value): value is string => value !== null)
        .sort()
        .at(-1) ?? toIsoStringOrNull(keeper.updatedAt);
    const mergedLastAgentRefresh =
      [...documents]
        .map((doc) => toDateOrNull(doc.lastAgentRefresh))
        .filter((value): value is Date => value !== null)
        .sort((left, right) => left.getTime() - right.getTime())
        .at(-1) ?? null;

    console.log(
      `- ${group.category} :: ${keeper.title ?? group.normalizedTitle} | keep=${keeper.slug ?? keeper._id.toHexString()} delete=${duplicates.length}`
    );
    for (const duplicate of duplicates) {
      console.log(
        `  delete -> ${duplicate.slug ?? duplicate._id.toHexString()} (${duplicate._id.toHexString()})`
      );
    }

    if (!commit) continue;

    await collection.updateOne(
      { _id: keeper._id },
      {
        $set: {
          viewCount: mergedViewCount,
          helpfulCount: mergedHelpfulCount,
          notHelpfulCount: mergedNotHelpfulCount,
          tags: mergedTags,
          targetUsers: mergedTargetUsers,
          legacySlugs: mergedLegacySlugs,
          relatedContent: mergedRelatedContent,
          isFeatured: documents.some((doc) => doc.isFeatured === true),
          isNew: documents.some((doc) => doc.isNew === true),
          isPublished: documents.some((doc) => doc.isPublished !== false),
          ...(mergedPublishedAt ? { publishedAt: mergedPublishedAt } : {}),
          ...(mergedUpdatedAt ? { updatedAt: mergedUpdatedAt } : {}),
          ...(mergedLastAgentRefresh ? { lastAgentRefresh: mergedLastAgentRefresh } : {}),
        },
      }
    );

    await collection.deleteMany({ _id: { $in: duplicates.map((doc) => doc._id) } });
  }
}

async function loadSemanticMirrorKeys(db: Db, keys: readonly string[]): Promise<Set<string>> {
  if (keys.length === 0) return new Set<string>();

  const collection = db.collection<SemanticChunkDoc>(GLOBAL_SEMANTIC_COLLECTION);
  const orClauses = keys
    .map((key) => {
      const [fileId, version, chunkIndex] = key.split('::');
      const versionNumber = Number(version);
      const chunkIndexNumber = Number(chunkIndex);
      if (!fileId || !Number.isFinite(versionNumber) || !Number.isFinite(chunkIndexNumber)) {
        return null;
      }
      return { fileId, version: versionNumber, chunkIndex: chunkIndexNumber };
    })
    .filter(
      (value): value is { fileId: string; version: number; chunkIndex: number } => value !== null
    );

  if (orClauses.length === 0) return new Set<string>();

  const documents = await collection
    .find({ $or: orClauses }, { projection: { _id: 0, fileId: 1, version: 1, chunkIndex: 1 } })
    .toArray();

  return new Set(
    documents.map((doc) => buildSemanticKey(doc)).filter((value): value is string => value !== null)
  );
}

async function buildSemanticResiduePlan(
  globalDb: Db,
  stagingDb: Db,
  productionDb: Db
): Promise<SemanticResiduePlan> {
  const collection = globalDb.collection<SemanticChunkDoc>(GLOBAL_SEMANTIC_COLLECTION);
  const documents = await collection
    .find(
      {},
      {
        projection: {
          fileId: 1,
          version: 1,
          chunkIndex: 1,
          ownerUserId: 1,
          teamId: 1,
          contentHash: 1,
          createdAt: 1,
        },
      }
    )
    .toArray();

  const keys = documents
    .map((doc) => buildSemanticKey(doc))
    .filter((value): value is string => value !== null);

  const [stagingKeys, productionKeys] = await Promise.all([
    loadSemanticMirrorKeys(stagingDb, keys),
    loadSemanticMirrorKeys(productionDb, keys),
  ]);

  const mirrored: SemanticChunkDoc[] = [];
  const unmatched: SemanticChunkDoc[] = [];

  for (const doc of documents) {
    const key = buildSemanticKey(doc);
    if (!key) {
      unmatched.push(doc);
      continue;
    }
    if (stagingKeys.has(key) || productionKeys.has(key)) {
      mirrored.push(doc);
    } else {
      unmatched.push(doc);
    }
  }

  return { mirrored, unmatched };
}

async function cleanupGlobalResidue(
  globalDb: Db,
  stagingDb: Db,
  productionDb: Db,
  commit: boolean,
  dropEmptyCollections: boolean
): Promise<void> {
  for (const collectionName of EMPTY_GLOBAL_COLLECTION_CANDIDATES) {
    const collection = globalDb.collection(collectionName);
    const count = await collection.countDocuments();
    console.log(`Global collection ${collectionName}: ${count} docs`);

    if (commit && dropEmptyCollections && count === 0) {
      await collection.drop().catch((error: unknown) => {
        const message = error instanceof Error ? error.message : String(error);
        if (!message.includes('ns not found')) {
          throw error;
        }
      });
      console.log(`  dropped empty collection ${collectionName}`);
    }
  }

  const plan = await buildSemanticResiduePlan(globalDb, stagingDb, productionDb);
  console.log(
    `Global semantic residue: mirrored=${plan.mirrored.length} unmatched=${plan.unmatched.length}`
  );

  for (const doc of plan.mirrored) {
    console.log(
      `  mirrored -> ${doc._id.toHexString()} fileId=${doc.fileId ?? 'unknown'} version=${String(doc.version ?? '')} chunk=${String(doc.chunkIndex ?? '')}`
    );
  }
  for (const doc of plan.unmatched) {
    console.log(
      `  manual-review -> ${doc._id.toHexString()} fileId=${doc.fileId ?? 'unknown'} version=${String(doc.version ?? '')} chunk=${String(doc.chunkIndex ?? '')}`
    );
  }

  if (commit && plan.mirrored.length > 0) {
    await globalDb
      .collection<SemanticChunkDoc>(GLOBAL_SEMANTIC_COLLECTION)
      .deleteMany({ _id: { $in: plan.mirrored.map((doc) => doc._id) } });
    console.log(`  deleted ${plan.mirrored.length} mirrored global semantic docs`);
  }
}

async function main(): Promise<void> {
  const commit = hasFlag('--commit');
  const dropEmptyCollections = hasFlag('--drop-empty-global-collections');
  const dbNames = resolveDbNames();
  const client = new MongoClient(resolveMongoUri());

  console.log(
    `${commit ? 'Commit' : 'Dry run'} cleanup against global=${dbNames.global}, staging=${dbNames.staging}, production=${dbNames.production}`
  );

  await client.connect();

  try {
    const globalDb = client.db(dbNames.global);
    const stagingDb = client.db(dbNames.staging);
    const productionDb = client.db(dbNames.production);

    await cleanupHelpArticleDuplicates(
      globalDb.collection<HelpArticleDoc>(HELP_ARTICLE_COLLECTION),
      commit
    );
    await cleanupGlobalResidue(globalDb, stagingDb, productionDb, commit, dropEmptyCollections);
  } finally {
    await client.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
