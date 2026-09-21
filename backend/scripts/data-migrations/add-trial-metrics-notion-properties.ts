/**
 * @fileoverview Add trial credit lifecycle properties to the Weekly KPIs and
 * Monthly Scoreboard Notion databases.
 *
 * The weekly/monthly reporting sync now pushes trial-started/converted/expired
 * /conversion-rate/avg-days-to-conversion fields (total + personal +
 * organization segments). Notion rejects page writes containing property
 * names that don't exist on the database schema, so these properties must be
 * created before the sync runs against a given environment.
 *
 * Usage:
 *   npx tsx --tsconfig tsconfig.scripts.json scripts/data-migrations/add-trial-metrics-notion-properties.ts --target=staging --commit
 *   npx tsx --tsconfig tsconfig.scripts.json scripts/data-migrations/add-trial-metrics-notion-properties.ts --target=production --commit
 */

import { getTarget, hasFlag } from '../migration/migration-utils.js';

const NOTION_API_BASE_URL = 'https://api.notion.com/v1';
const NOTION_API_VERSION = '2022-06-28';

type NotionNumberFormat = 'number' | 'percent';

function buildTrialProperties(): Record<string, { number: { format: NotionNumberFormat } }> {
  const countFields = [
    'Trials Started (Actual)',
    'Personal Trials Started (Actual)',
    'Organization Trials Started (Actual)',
    'Trials Converted (Actual)',
    'Personal Trials Converted (Actual)',
    'Organization Trials Converted (Actual)',
    'Trials Expired (Actual)',
    'Personal Trials Expired (Actual)',
    'Organization Trials Expired (Actual)',
    'Avg Days to Trial Conversion (Actual)',
    'Personal Avg Days to Trial Conversion (Actual)',
    'Organization Avg Days to Trial Conversion (Actual)',
  ];
  const percentFields = [
    'Trial Conversion Rate (%)',
    'Personal Trial Conversion Rate (%)',
    'Organization Trial Conversion Rate (%)',
  ];

  const properties: Record<string, { number: { format: NotionNumberFormat } }> = {};
  for (const field of countFields) properties[field] = { number: { format: 'number' } };
  for (const field of percentFields) properties[field] = { number: { format: 'percent' } };
  return properties;
}

interface DatabaseTarget {
  readonly label: string;
  readonly databaseId?: string;
}

function resolveDatabaseTargets(target: 'staging' | 'production'): DatabaseTarget[] {
  const envPrefix = target === 'production' ? 'PRODUCTION' : 'STAGING';

  return [
    {
      label: 'Weekly KPIs',
      databaseId:
        process.env[`${envPrefix}_NOTION_WEEKLY_KPIS_DATABASE_ID`]?.trim() ||
        process.env['NOTION_WEEKLY_KPIS_DATABASE_ID']?.trim(),
    },
    {
      label: 'Monthly Scoreboard',
      databaseId:
        process.env[`${envPrefix}_NOTION_MONTHLY_SCOREBOARD_DATABASE_ID`]?.trim() ||
        process.env['NOTION_MONTHLY_SCOREBOARD_DATABASE_ID']?.trim(),
    },
  ];
}

async function updateDatabaseSchema(
  apiToken: string,
  databaseId: string,
  properties: Record<string, unknown>
): Promise<void> {
  const response = await fetch(`${NOTION_API_BASE_URL}/databases/${databaseId}`, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${apiToken}`,
      'Content-Type': 'application/json',
      'Notion-Version': NOTION_API_VERSION,
    },
    body: JSON.stringify({ properties }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`Notion database update failed (${response.status}): ${body.slice(0, 500)}`);
  }
}

async function main(): Promise<void> {
  const target = getTarget();
  const commit = hasFlag('commit');
  const apiToken = process.env['NOTION_API_TOKEN']?.trim();

  if (!apiToken) {
    throw new Error('NOTION_API_TOKEN is not configured.');
  }

  if (target === 'production' && !commit) {
    throw new Error(
      'Production requires --commit. Run without --commit only for a dry-run on staging.'
    );
  }

  const properties = buildTrialProperties();
  const propertyNames = Object.keys(properties);
  const databases = resolveDatabaseTargets(target);

  console.log(`Target: ${target}`);
  console.log(`Mode: ${commit ? 'COMMIT' : 'DRY RUN'}`);
  console.log(`Properties to add/update (${propertyNames.length}): ${propertyNames.join(', ')}`);

  for (const database of databases) {
    if (!database.databaseId) {
      console.log(`  Skipping ${database.label}: no database id configured for ${target}.`);
      continue;
    }

    console.log(
      `  ${commit ? 'Updating' : 'Would update'} ${database.label} (${database.databaseId})`
    );

    if (!commit) continue;

    await updateDatabaseSchema(apiToken, database.databaseId, properties);
    console.log(`  Updated ${database.label} schema.`);
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
