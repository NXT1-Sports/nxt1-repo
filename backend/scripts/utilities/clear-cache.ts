/**
 * @fileoverview Clear Redis Cache Script
 *
 * Usage:
 *   npx tsx scripts/clear-cache.ts              # Clear all cache
 *   npx tsx scripts/clear-cache.ts --pattern=profile:*  # Clear specific pattern
 *   npx tsx scripts/clear-cache.ts --env=staging # Clear staging cache
 */

import { config } from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, '../.env') });

import { CacheFactory } from '@nxt1/cache';

// ─── CLI Args ─────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const getArg = (name: string) =>
  args
    .find((a) => a.startsWith(`--${name}=`))
    ?.split('=')
    .slice(1)
    .join('=') ?? null;

const pattern = getArg('pattern') || '*';
const useStaging = getArg('env') === 'staging';

// ─── Main ─────────────────────────────────────────────────────────────────────
async function main(): Promise<void> {
  console.log('[clear-cache] Starting cache clear operation...\n');

  // Build Redis URL
  const redisHost = useStaging
    ? process.env['STAGING_REDIS_URL'] || process.env['REDIS_URL'] || 'redis://localhost:6379'
    : process.env['REDIS_URL'] || 'redis://localhost:6379';

  const redisDb = useStaging ? process.env['STAGING_REDIS_DB'] : process.env['REDIS_DB'];
  const redisUrl = redisDb ? `${redisHost.replace(/\/$/, '')}/${redisDb}` : redisHost;

  console.log(`Environment: ${useStaging ? 'STAGING' : 'PRODUCTION'}`);
  console.log(`Redis URL: ${redisUrl.replace(/:[^:]*@/, ':****@')}`); // Hide password
  console.log(`Pattern: ${pattern}\n`);

  try {
    // Initialize cache service
    const cache = await CacheFactory.create(redisUrl);

    // Clear cache by pattern
    const deleteCount = await cache.del(pattern);

    console.log(
      `✅ Successfully cleared ${deleteCount} cache entries matching pattern: ${pattern}`
    );

    // Show some common patterns user might want to clear
    if (pattern === '*') {
      console.log('\n💡 Tip: You can clear specific patterns:');
      console.log('   npx tsx scripts/clear-cache.ts --pattern=profile:*');
      console.log('   npx tsx scripts/clear-cache.ts --pattern=team:*');
      console.log('   npx tsx scripts/clear-cache.ts --pattern=feed:*');
      console.log('   npx tsx scripts/clear-cache.ts --pattern=colleges:*');
    }

    process.exit(0);
  } catch (error) {
    console.error('❌ Failed to clear cache:', error);
    process.exit(1);
  }
}

main();
