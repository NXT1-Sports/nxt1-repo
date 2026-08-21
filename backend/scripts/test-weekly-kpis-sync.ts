/**
 * Manual smoke test for Weekly KPIs Notion sync.
 * Runs report generation and Notion upsert directly against real data.
 *
 * Usage:
 *   NODE_ENV=staging    npx tsx scripts/test-weekly-kpis-sync.ts
 *   NODE_ENV=production npx tsx scripts/test-weekly-kpis-sync.ts
 */

// Step 1: Load env vars (pure imports, no side-effects at load time)
import { config as loadDotenv } from 'dotenv';
import { resolve } from 'path';
import { fileURLToPath } from 'url';
import mongoose from 'mongoose';

const __filename = fileURLToPath(import.meta.url);
const backendRoot = resolve(__filename, '../..');
loadDotenv({ path: resolve(backendRoot, '.env') });
loadDotenv({ path: resolve(backendRoot, '.env.local'), override: true });

// Step 2: Dynamic imports AFTER env vars are loaded
// firebase.ts runs initializeApp() at module-load time, so it MUST be a dynamic
// import so FIREBASE_* env vars are already set in process.env when it executes.
const { db } = await import('../src/utils/firebase.js');
const { connectToMongoDB, disconnectFromMongoDB } =
  await import('../src/config/database.config.js');
const { generateWeeklyKpisReport, getPreviousWeekStart } =
  await import('../src/services/reporting/weekly-kpis-report.service.js');

// Step 3: Run
const environment = (process.env['NODE_ENV'] === 'production' ? 'production' : 'staging') as
  | 'production'
  | 'staging';
console.log(`\n🚀 Weekly KPIs smoke test — environment: ${environment}\n`);

const notionToken = process.env['NOTION_API_TOKEN'];
const weeklyKpisEnabled = process.env['NOTION_WEEKLY_KPIS_ENABLED'] === 'true';
const databaseId =
  environment === 'production'
    ? process.env['PRODUCTION_NOTION_WEEKLY_KPIS_DATABASE_ID']
    : process.env['STAGING_NOTION_WEEKLY_KPIS_DATABASE_ID'];

if (!notionToken) throw new Error('Missing NOTION_API_TOKEN');
if (!weeklyKpisEnabled) throw new Error('NOTION_WEEKLY_KPIS_ENABLED is not true');
if (!databaseId)
  throw new Error(`Missing ${environment.toUpperCase()}_NOTION_WEEKLY_KPIS_DATABASE_ID`);

console.log('✅ Env vars OK');
console.log(`   NOTION_API_TOKEN: ...${notionToken.slice(-6)}`);
console.log(`   database ID:      ${databaseId}\n`);

console.log('🔌 Connecting to MongoDB...');
await connectToMongoDB();
console.log(
  `   Mongoose: ${mongoose.connection.readyState === 1 ? 'connected ✅' : 'NOT connected ❌'}\n`
);

const weekStart = getPreviousWeekStart();
console.log(`📅 Week: ${weekStart.toISOString().slice(0, 10)}`);
console.log('⚙️  Generating report...\n');

const result = await generateWeeklyKpisReport({
  db,
  weekStart,
  environment,
  notionEnvironment: environment,
  pushToNotion: true,
});

const m = result.metrics;
console.log('📊 Metrics:');
console.log(`   New accounts started:    ${m.newAccountsStartedActual}`);
console.log(`   Usage started accounts:  ${m.usageStartedAccountsActual}`);
console.log(`   Closed won:              ${m.closedWonAccountsActual}`);
console.log(`   Churned:                 ${m.churnedAccountsActual}`);
console.log(`   Active accounts:         ${m.activeAccountsActual}`);
console.log(`   Usage revenue:           $${m.usageRevenueActual.toFixed(2)}`);
console.log(`   Gross margin:            ${m.grossMarginPercentActual.toFixed(1)}%`);
console.log(`   Usage start rate:        ${m.usageStartRatePercent.toFixed(1)}%`);
if (m.timeToFirstOutcomeHoursActual !== undefined) {
  console.log(`   Time to first outcome:   ${m.timeToFirstOutcomeHoursActual}h`);
}

console.log('\n📝 Notion result:');
if (result.notionResult) {
  console.log(`   Status:  ${result.notionResult.status}`);
  if (result.notionResult.pageId) console.log(`   Page ID: ${result.notionResult.pageId}`);
  if (result.notionResult.reason) console.log(`   Reason:  ${result.notionResult.reason}`);
} else {
  console.log('   (pushToNotion was false)');
}

const success =
  result.notionResult?.status === 'created' || result.notionResult?.status === 'updated';
console.log(
  success ? '\n✅ PASSED — row written to Notion' : '\n⚠️  Notion write skipped or failed'
);

await disconnectFromMongoDB();
process.exit(success ? 0 : 1);
