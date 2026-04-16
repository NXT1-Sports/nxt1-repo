import { afterEach, describe, expect, it } from 'vitest';
import { getMongoDatabaseName, getRuntimeEnvironment } from '../runtime-environment.js';

describe('runtime-environment helpers', () => {
  const originalNodeEnv = process.env['NODE_ENV'];
  const originalDbName = process.env['MONGO_DB_NAME'];
  const originalStagingDbName = process.env['MONGO_DB_NAME_STAGING'];
  const originalProductionDbName = process.env['MONGO_DB_NAME_PRODUCTION'];

  afterEach(() => {
    process.env['NODE_ENV'] = originalNodeEnv;
    process.env['MONGO_DB_NAME'] = originalDbName;
    process.env['MONGO_DB_NAME_STAGING'] = originalStagingDbName;
    process.env['MONGO_DB_NAME_PRODUCTION'] = originalProductionDbName;
  });

  it('defaults non-production runtimes to staging and derives a staging db name', () => {
    process.env['NODE_ENV'] = 'test';
    delete process.env['MONGO_DB_NAME'];
    delete process.env['MONGO_DB_NAME_STAGING'];

    expect(getRuntimeEnvironment()).toBe('staging');
    expect(getMongoDatabaseName('mongodb+srv://example.mongodb.net/nxt?retryWrites=true')).toBe(
      'nxt_staging'
    );
  });

  it('uses environment-specific overrides when provided', () => {
    process.env['NODE_ENV'] = 'production';
    process.env['MONGO_DB_NAME_PRODUCTION'] = 'nxt_production';

    expect(getRuntimeEnvironment()).toBe('production');
    expect(getMongoDatabaseName('mongodb+srv://example.mongodb.net/nxt')).toBe('nxt_production');
  });
});
