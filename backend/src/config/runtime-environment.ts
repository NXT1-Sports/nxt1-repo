/**
 * @fileoverview Runtime environment helpers
 * @module @nxt1/backend/config/runtime-environment
 */

export type RuntimeEnvironment = 'staging' | 'production';

export function getRuntimeEnvironment(): RuntimeEnvironment {
  return process.env['NODE_ENV'] === 'production' ? 'production' : 'staging';
}

export function getMongoDatabaseName(mongoUri?: string): string {
  const environment = getRuntimeEnvironment();
  const envSpecific =
    environment === 'production'
      ? process.env['MONGO_DB_NAME_PRODUCTION']
      : process.env['MONGO_DB_NAME_STAGING'];

  if (typeof envSpecific === 'string' && envSpecific.trim().length > 0) {
    return envSpecific.trim();
  }

  const sharedName = process.env['MONGO_DB_NAME'];
  if (typeof sharedName === 'string' && sharedName.trim().length > 0) {
    return sharedName.trim();
  }

  const baseName = extractMongoDatabaseNameFromUri(mongoUri) ?? 'nxt';
  if (baseName.endsWith('_staging') || baseName.endsWith('_production')) {
    return baseName;
  }

  return `${baseName}_${environment}`;
}

function extractMongoDatabaseNameFromUri(mongoUri?: string): string | undefined {
  if (!mongoUri) return undefined;

  const withoutQuery = mongoUri.split('?')[0] ?? '';
  const lastSlash = withoutQuery.lastIndexOf('/');
  if (lastSlash === -1 || lastSlash === withoutQuery.length - 1) return undefined;

  const dbName = withoutQuery.slice(lastSlash + 1).trim();
  return dbName.length > 0 ? dbName : undefined;
}
