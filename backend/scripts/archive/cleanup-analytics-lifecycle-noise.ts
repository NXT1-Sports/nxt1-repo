import 'dotenv/config';
import mongoose from 'mongoose';
import { logger } from '../src/utils/logger.js';

type RuntimeEnvironment = 'staging' | 'production';
type CleanupMode = 'purge' | 'reclassify';

type AnalyticsEventDocument = {
  readonly _id: mongoose.Types.ObjectId;
  readonly environment?: RuntimeEnvironment;
  readonly subjectId: string;
  readonly subjectType: string;
  readonly domain: string;
  readonly eventType: string;
  readonly occurredAt: Date;
  readonly source: 'agent' | 'user' | 'system';
  readonly actorUserId?: string | null;
  readonly sessionId?: string | null;
  readonly threadId?: string | null;
  readonly value?: number | string | boolean | null;
  readonly numericValue?: number | null;
  readonly tags?: readonly string[];
  readonly payload?: Readonly<Record<string, unknown>>;
  readonly metadata?: Readonly<Record<string, unknown>>;
  readonly meta: Readonly<Record<string, unknown>>;
};

type InsertableAnalyticsEventDocument = Omit<AnalyticsEventDocument, '_id'> & {
  readonly _id?: mongoose.Types.ObjectId;
};

const LEGACY_SYSTEM_EVENT_TYPES = [
  'agent_task_completed',
  'agent_task_failed',
  'tool_write_completed',
] as const;

const SYNC_LIKE_TOOL_NAMES = new Set([
  'write_core_identity',
  'write_calendar_events',
  'write_schedule',
  'write_team_stats',
  'write_athlete_videos',
]);

const SYNC_LIKE_INITIATORS = new Set([
  'write-core-identity',
  'write-calendar-events',
  'write-schedule',
  'write-team-stats',
  'write-athlete-videos',
]);

function getArgValue(flag: string): string | undefined {
  const exact = process.argv.find((arg) => arg.startsWith(`${flag}=`));
  if (exact) {
    return exact.slice(flag.length + 1);
  }

  const index = process.argv.indexOf(flag);
  if (index === -1) return undefined;

  const next = process.argv[index + 1];
  return next && !next.startsWith('--') ? next : undefined;
}

function getEnvironment(): RuntimeEnvironment {
  return process.argv.includes('--production') ? 'production' : 'staging';
}

function getMode(): CleanupMode {
  const raw = getArgValue('--mode') ?? 'purge';
  if (raw !== 'purge' && raw !== 'reclassify') {
    throw new Error(`Unsupported mode "${raw}". Use --mode=purge or --mode=reclassify.`);
  }
  return raw;
}

function resolveMongoDatabaseName(environment: RuntimeEnvironment, mongoUri: string): string {
  const envSpecific =
    environment === 'production'
      ? process.env['MONGO_DB_NAME_PRODUCTION']
      : process.env['MONGO_DB_NAME_STAGING'];

  if (envSpecific && envSpecific.trim().length > 0) {
    return envSpecific.trim();
  }

  const sharedName = process.env['MONGO_DB_NAME'];
  if (sharedName && sharedName.trim().length > 0) {
    return sharedName.trim();
  }

  const baseName = extractMongoDatabaseNameFromUri(mongoUri) ?? 'nxt';
  const normalizedBaseName = baseName.replace(/_(staging|production)$/, '');
  return `${normalizedBaseName}_${environment}`;
}

function extractMongoDatabaseNameFromUri(mongoUri: string): string | undefined {
  const withoutQuery = mongoUri.split('?')[0] ?? '';
  const lastSlash = withoutQuery.lastIndexOf('/');
  if (lastSlash === -1 || lastSlash === withoutQuery.length - 1) {
    return undefined;
  }

  const databaseName = withoutQuery.slice(lastSlash + 1).trim();
  return databaseName.length > 0 ? databaseName : undefined;
}

function isSyncLikeLegacyEvent(doc: AnalyticsEventDocument): boolean {
  if (doc.eventType !== 'tool_write_completed') {
    return false;
  }

  const payload = (doc.payload ?? {}) as Record<string, unknown>;
  const metadata = (doc.metadata ?? {}) as Record<string, unknown>;
  const toolName = typeof payload['toolName'] === 'string' ? payload['toolName'] : null;
  const initiatedBy = typeof metadata['initiatedBy'] === 'string' ? metadata['initiatedBy'] : null;

  return (
    (toolName !== null && SYNC_LIKE_TOOL_NAMES.has(toolName)) ||
    (initiatedBy !== null && SYNC_LIKE_INITIATORS.has(initiatedBy))
  );
}

function buildReclassifiedDocument(doc: AnalyticsEventDocument): InsertableAnalyticsEventDocument {
  const payload = (doc.payload ?? {}) as Record<string, unknown>;
  const metadata = (doc.metadata ?? {}) as Record<string, unknown>;
  const nowIso = new Date().toISOString();

  return {
    environment: doc.environment,
    subjectId: doc.subjectId,
    subjectType: doc.subjectType,
    domain: 'system',
    eventType: 'sync_completed',
    occurredAt: doc.occurredAt,
    source: doc.source,
    actorUserId: doc.actorUserId ?? null,
    sessionId: doc.sessionId ?? null,
    threadId: doc.threadId ?? null,
    value: doc.value ?? null,
    numericValue: doc.numericValue ?? null,
    tags: [...(doc.tags ?? [])],
    payload: {
      ...payload,
      reclassifiedFromLegacyEventType: doc.eventType,
      reclassifiedByCleanupScript: true,
    },
    metadata: {
      ...metadata,
      reclassifiedFromLegacyEventType: doc.eventType,
      reclassifiedAt: nowIso,
      cleanupScript: 'cleanup-analytics-lifecycle-noise',
    },
    meta: {
      ...doc.meta,
      environment: doc.environment,
      subjectId: doc.subjectId,
      subjectType: doc.subjectType,
      domain: 'system',
    },
  };
}

async function main(): Promise<void> {
  const mongoUri = process.env['MONGO'];
  if (!mongoUri) {
    throw new Error('MONGO environment variable is not set');
  }

  const environment = getEnvironment();
  const mode = getMode();
  const dryRun = process.argv.includes('--dry-run');
  const limitRaw = getArgValue('--limit');
  const limit = limitRaw ? Number.parseInt(limitRaw, 10) : undefined;
  const beforeRaw = getArgValue('--before');
  const before = beforeRaw ? new Date(beforeRaw) : null;

  if (beforeRaw && (!before || Number.isNaN(before.getTime()))) {
    throw new Error(`Invalid --before value: ${beforeRaw}`);
  }

  await mongoose.connect(mongoUri);

  try {
    const databaseName = resolveMongoDatabaseName(environment, mongoUri);
    const db = mongoose.connection.getClient().db(databaseName);
    const collection = db.collection<AnalyticsEventDocument>('analyticsEvents');
    const insertableCollection = db.collection<InsertableAnalyticsEventDocument>('analyticsEvents');

    const match: Record<string, unknown> = {
      environment,
      domain: 'system',
      eventType: { $in: [...LEGACY_SYSTEM_EVENT_TYPES] },
    };

    if (before) {
      match['occurredAt'] = { $lt: before };
    }

    let cursor = collection.find(match).sort({ occurredAt: 1, _id: 1 });
    if (typeof limit === 'number' && Number.isFinite(limit) && limit > 0) {
      cursor = cursor.limit(limit);
    }

    const documents = await cursor.toArray();
    const reclassifiable = documents.filter(isSyncLikeLegacyEvent);
    const purgeOnly = documents.filter((doc) => !isSyncLikeLegacyEvent(doc));

    logger.info('[cleanup-analytics-lifecycle-noise] Loaded legacy analytics events', {
      environment,
      mode,
      dryRun,
      databaseName,
      matchedCount: documents.length,
      reclassifiableCount: reclassifiable.length,
      purgeOnlyCount: purgeOnly.length,
      before: before?.toISOString() ?? null,
      limit: limit ?? null,
    });

    if (documents.length === 0) {
      logger.info('[cleanup-analytics-lifecycle-noise] No legacy analytics events found');
      return;
    }

    if (dryRun) {
      logger.info('[cleanup-analytics-lifecycle-noise] Dry run complete', {
        sampleIds: documents.slice(0, 10).map((doc) => String(doc._id)),
      });
      return;
    }

    if (mode === 'purge') {
      const ids = documents.map((doc) => doc._id);
      const result = await collection.deleteMany({ _id: { $in: ids } });
      logger.info('[cleanup-analytics-lifecycle-noise] Purged legacy analytics events', {
        environment,
        deletedCount: result.deletedCount,
      });
      return;
    }

    if (reclassifiable.length > 0) {
      const replacementDocs = reclassifiable.map(buildReclassifiedDocument);
      await insertableCollection.insertMany(replacementDocs, { ordered: false });
      await collection.deleteMany({ _id: { $in: reclassifiable.map((doc) => doc._id) } });
    }

    logger.info(
      '[cleanup-analytics-lifecycle-noise] Reclassified sync-like legacy analytics events',
      {
        environment,
        reclassifiedCount: reclassifiable.length,
        skippedLegacyCount: purgeOnly.length,
        skippedLegacyEventTypes: [...new Set(purgeOnly.map((doc) => doc.eventType))],
      }
    );
  } finally {
    await mongoose.disconnect().catch(() => undefined);
  }
}

main()
  .then(() => {
    process.exit(0);
  })
  .catch((error: unknown) => {
    logger.error('[cleanup-analytics-lifecycle-noise] Failed', {
      error: error instanceof Error ? error.message : String(error),
    });
    process.exit(1);
  });
