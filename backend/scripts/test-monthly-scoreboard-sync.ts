/**
 * Manual sync for a Monthly Scoreboard Notion row.
 *
 * Usage:
 *   NODE_ENV=production npx tsx scripts/test-monthly-scoreboard-sync.ts --month-start=2026-08-01
 */

import { config as loadDotenv } from 'dotenv';
import { resolve } from 'path';
import { fileURLToPath } from 'url';
import mongoose from 'mongoose';

const __filename = fileURLToPath(import.meta.url);
const backendRoot = resolve(__filename, '../..');
loadDotenv({ path: resolve(backendRoot, '.env') });
loadDotenv({ path: resolve(backendRoot, '.env.local'), override: true });

const { db } = await import('../src/utils/firebase.js');
const { connectToMongoDB, disconnectFromMongoDB } =
  await import('../src/config/database.config.js');
const { generateMonthlyScoreboardReport, getPreviousMonthStart } =
  await import('../src/services/reporting/monthly-scoreboard-report.service.js');

const environment = (process.env['NODE_ENV'] === 'production' ? 'production' : 'staging') as
  | 'production'
  | 'staging';
const monthStartArgument = process.argv.find((arg) => arg.startsWith('--month-start='));
const monthStartValue = monthStartArgument?.slice('--month-start='.length);
const monthStart = monthStartValue
  ? new Date(`${monthStartValue}T00:00:00.000Z`)
  : getPreviousMonthStart();

if (
  monthStartValue &&
  (!/^\d{4}-\d{2}-\d{2}$/.test(monthStartValue) ||
    Number.isNaN(monthStart.getTime()) ||
    monthStart.getUTCDate() !== 1)
) {
  throw new Error('--month-start must be a valid first day of a month in YYYY-MM-DD format');
}

console.log(`Monthly Scoreboard sync: ${monthStart.toISOString().slice(0, 10)} (${environment})`);

await connectToMongoDB();
try {
  const result = await generateMonthlyScoreboardReport({
    db,
    monthStart,
    environment,
    notionEnvironment: environment,
    pushToNotion: true,
  });

  console.log(`MongoDB connected: ${mongoose.connection.readyState === 1}`);
  console.log(`Reconciled cost: $${result.metrics.reconciledCostActual.toFixed(2)}`);
  console.log(`Notion result: ${result.notionResult?.status ?? 'not-run'}`);

  if (result.notionResult?.status !== 'created' && result.notionResult?.status !== 'updated') {
    throw new Error(result.notionResult?.reason ?? 'Monthly Scoreboard Notion sync failed');
  }
} finally {
  await disconnectFromMongoDB();
}
