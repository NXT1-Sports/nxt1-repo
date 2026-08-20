#!/usr/bin/env tsx
import 'dotenv/config';
import mongoose from 'mongoose';

import {
  AGENT_CONTEXT_PREFIX,
  buildAgentContextCacheKey,
} from '../../src/modules/agent/memory/context-builder.js';
import { initializeCacheService } from '../../src/services/core/cache.service.js';

const USER_ID = 'h66zaFP7C6RVMaozoH8gjV6fO3k1';
const TEAM_ID = 'dcMXopxlmcXIIrsbORb3';
const COLOR_MEMORY_PATTERN = /(blue|蓝色)/i;

const args = process.argv.slice(2);
const commit = args.includes('--commit');
const environment = args.includes('--staging') ? 'staging' : 'production';

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

function resolveDbName(): string {
  const base = process.env['MONGO_DB_NAME_GLOBAL']?.trim() || 'nxt';
  if (environment === 'staging') {
    return process.env['MONGO_DB_NAME_STAGING']?.trim() || `${base}_staging`;
  }
  return process.env['MONGO_DB_NAME_PRODUCTION']?.trim() || `${base}_production`;
}

async function invalidateContextCache(): Promise<void> {
  try {
    const cache = await initializeCacheService();
    await Promise.all([
      cache.del(buildAgentContextCacheKey(USER_ID)),
      cache.del(`${AGENT_CONTEXT_PREFIX}production:${USER_ID}`),
      cache.del(`${AGENT_CONTEXT_PREFIX}staging:${USER_ID}`),
      cache.del(`${AGENT_CONTEXT_PREFIX}${USER_ID}`),
    ]);
    console.log('Invalidated agent context cache keys for Garfield user.');
  } catch (error) {
    console.warn('Failed to invalidate context cache; continuing.', error);
  }
}

async function main(): Promise<void> {
  const dbName = resolveDbName();
  await mongoose.connect(resolveMongoUri(), { dbName });
  const collection = mongoose.connection.collection('agentmemories');
  const filter = {
    userId: USER_ID,
    teamId: TEAM_ID,
    content: { $regex: COLOR_MEMORY_PATTERN },
  };

  const matches = await collection
    .find(filter, { projection: { _id: 1, target: 1, content: 1, createdAt: 1 } })
    .sort({ createdAt: 1 })
    .toArray();

  console.log(
    `${commit ? 'Deleting' : 'Dry run:'} ${matches.length} contaminated Garfield color memories in ${dbName}.`
  );
  for (const match of matches) {
    console.log(`- ${String(match['_id'])} [${match['target'] ?? 'unknown'}] ${match['content']}`);
  }

  if (commit && matches.length > 0) {
    const result = await collection.deleteMany(filter);
    console.log(`Deleted ${result.deletedCount} contaminated memory record(s).`);
    await invalidateContextCache();
  }

  await mongoose.disconnect();
}

main()
  .then(() => {
    process.exit(0);
  })
  .catch(async (error) => {
    console.error(error);
    await mongoose.disconnect().catch(() => undefined);
    process.exit(1);
  });
