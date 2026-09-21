import { afterEach, describe, expect, it } from 'vitest';
import { getNotionMonthlyScoreboardConfig } from '../notion-client.service.js';

const originalEnvironment = {
  enabled: process.env['NOTION_MONTHLY_SCOREBOARD_ENABLED'],
  productionDatabaseId: process.env['PRODUCTION_NOTION_MONTHLY_SCOREBOARD_DATABASE_ID'],
  stagingDatabaseId: process.env['STAGING_NOTION_MONTHLY_SCOREBOARD_DATABASE_ID'],
  sharedDatabaseId: process.env['NOTION_MONTHLY_SCOREBOARD_DATABASE_ID'],
};

afterEach(() => {
  for (const [key, value] of Object.entries({
    NOTION_MONTHLY_SCOREBOARD_ENABLED: originalEnvironment.enabled,
    PRODUCTION_NOTION_MONTHLY_SCOREBOARD_DATABASE_ID: originalEnvironment.productionDatabaseId,
    STAGING_NOTION_MONTHLY_SCOREBOARD_DATABASE_ID: originalEnvironment.stagingDatabaseId,
    NOTION_MONTHLY_SCOREBOARD_DATABASE_ID: originalEnvironment.sharedDatabaseId,
  })) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

describe('getNotionMonthlyScoreboardConfig', () => {
  it('keeps the production binding and ignores shared fallback IDs', () => {
    process.env['NOTION_MONTHLY_SCOREBOARD_ENABLED'] = 'true';
    process.env['PRODUCTION_NOTION_MONTHLY_SCOREBOARD_DATABASE_ID'] = 'production-db';
    process.env['NOTION_MONTHLY_SCOREBOARD_DATABASE_ID'] = 'shared-db';

    const config = getNotionMonthlyScoreboardConfig('production');

    expect(config.enabled).toBe(true);
    expect(config.databaseId).toBe('production-db');
  });

  it('disables staging and never resolves a Monthly Scoreboard database ID', () => {
    process.env['NOTION_MONTHLY_SCOREBOARD_ENABLED'] = 'true';
    process.env['PRODUCTION_NOTION_MONTHLY_SCOREBOARD_DATABASE_ID'] = 'production-db';
    process.env['STAGING_NOTION_MONTHLY_SCOREBOARD_DATABASE_ID'] = 'staging-db';
    process.env['NOTION_MONTHLY_SCOREBOARD_DATABASE_ID'] = 'shared-db';

    const config = getNotionMonthlyScoreboardConfig('staging');

    expect(config.enabled).toBe(false);
    expect(config.databaseId).toBeUndefined();
  });
});
