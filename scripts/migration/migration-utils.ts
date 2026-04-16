/**
 * @fileoverview Shared Migration Utilities
 *
 * Common helpers used across all migration scripts:
 * - Dual Firebase project initialization (legacy source + V2 target)
 * - CLI argument parsing (--target, --dry-run, --limit, --legacy-sa, --verbose)
 * - Progress reporting
 * - Batch write helpers
 * - Timestamp conversion
 * - Field normalization utilities
 *
 * Usage: Import into any migration script
 *   import { initLegacyApp, initTargetApp, getArg, ... } from './migration-utils';
 */

import { config } from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, '../../backend/.env') });

import { readFileSync } from 'node:fs';
import { writeFileSync } from 'node:fs';
import { initializeApp, cert, getApp, type ServiceAccount, type App } from 'firebase-admin/app';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';

// ─── CLI Argument Parsing ─────────────────────────────────────────────────────

const args = process.argv.slice(2);

/**
 * Parse a CLI argument by name.
 * Supports: --name=value, --name value, --flag (boolean)
 */
export function getArg(name: string): string | null {
  const prefixed = `--${name}=`;
  const found = args.find((a) => a.startsWith(prefixed));
  if (found) return found.slice(prefixed.length);
  return null;
}

/** Check if a boolean flag is present (e.g. --dry-run, --verbose) */
export function hasFlag(name: string): boolean {
  return args.includes(`--${name}`);
}

/** Parse --limit=N, returns 0 if not set (meaning no limit) */
export function getLimit(): number {
  return parseInt(getArg('limit') ?? '0', 10) || 0;
}

/** Parse --target=staging|production, defaults to 'staging' */
export function getTarget(): 'staging' | 'production' {
  const target = getArg('target');
  if (target === 'production') return 'production';
  return 'staging';
}

export const isDryRun = hasFlag('dry-run');
export const isVerbose = hasFlag('verbose');
export const PAGE_SIZE = 200;
export const BATCH_SIZE = 500;

// ─── Firebase Dual-Project Initialization ─────────────────────────────────────

const LEGACY_APP_NAME = 'legacy-nxt1';
const TARGET_APP_NAME = 'target-v2';

// Default service account paths
const LEGACY_SA_DEFAULT = resolve(
  __dirname,
  '../../../nxt1-backend/assets/nxt-1-de054-firebase-adminsdk-w01w0-2bab8ae108.json'
);
const STAGING_SA_DEFAULT = resolve(
  __dirname,
  '../../backend/assets/nxt-1-staging-v2-ae4fac811aa4.json'
);
const PRODUCTION_SA_DEFAULT =
  process.env['GOOGLE_APPLICATION_CREDENTIALS'] ||
  resolve(__dirname, '../../backend/assets/nxt-1-v2-firebase-adminsdk.json');

function loadServiceAccount(path: string): ServiceAccount {
  try {
    const raw = readFileSync(path, 'utf-8');
    return JSON.parse(raw) as ServiceAccount;
  } catch (err) {
    throw new Error(
      `Failed to load service account from: ${path}\n` +
        `  Ensure the file exists and is valid JSON.\n` +
        `  Original error: ${err instanceof Error ? err.message : String(err)}`,
      { cause: err }
    );
  }
}

/**
 * Initialize the legacy Firebase app (source: nxt-1-de054).
 * Returns the Firestore instance for the legacy project.
 */
export function initLegacyApp(): { app: App; db: Firestore } {
  try {
    const existing = getApp(LEGACY_APP_NAME);
    return { app: existing, db: getFirestore(existing) };
  } catch {
    // App doesn't exist yet, initialize it
  }

  const saPath = getArg('legacy-sa') || LEGACY_SA_DEFAULT;
  console.log(`  Legacy SA: ${saPath}`);
  const sa = loadServiceAccount(saPath);

  const app = initializeApp({ credential: cert(sa) }, LEGACY_APP_NAME);
  const db = getFirestore(app);
  return { app, db };
}

/**
 * Initialize the target Firebase app (staging or production).
 * Returns the Firestore instance for the target project.
 */
export function initTargetApp(): { app: App; db: Firestore } {
  try {
    const existing = getApp(TARGET_APP_NAME);
    return { app: existing, db: getFirestore(existing) };
  } catch {
    // App doesn't exist yet, initialize it
  }

  const target = getTarget();
  const saPath = target === 'production' ? PRODUCTION_SA_DEFAULT : STAGING_SA_DEFAULT;

  console.log(`  Target (${target}): ${saPath}`);
  const sa = loadServiceAccount(saPath);

  const app = initializeApp({ credential: cert(sa) }, TARGET_APP_NAME);
  const db = getFirestore(app);
  return { app, db };
}

// ─── Timestamp Conversion ─────────────────────────────────────────────────────

/**
 * Convert a Firestore Timestamp, Date, or string to ISO string.
 * Returns null if the input is falsy.
 */
export function toISOString(value: unknown): string | undefined {
  if (!value) return undefined;

  // Firestore Timestamp (has toDate method)
  if (typeof value === 'object' && value !== null && 'toDate' in value) {
    const ts = value as { toDate: () => Date };
    try {
      return ts.toDate().toISOString();
    } catch {
      return undefined;
    }
  }

  // Date object
  if (value instanceof Date) {
    try {
      return value.toISOString();
    } catch {
      return undefined;
    }
  }

  // String — validate it's a plausible date
  if (typeof value === 'string') {
    const d = new Date(value);
    if (!isNaN(d.getTime())) return d.toISOString();
  }

  // Number (epoch ms)
  if (typeof value === 'number' && value > 0) {
    const d = new Date(value);
    if (!isNaN(d.getTime())) return d.toISOString();
  }

  return undefined;
}

// ─── String Utilities ─────────────────────────────────────────────────────────

/** Trim and normalize whitespace. Returns undefined if empty. */
export function cleanString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

/** Trim and lowercase an email. Returns undefined if empty. */
export function cleanEmail(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const cleaned = value.trim().toLowerCase();
  return cleaned.length > 0 ? cleaned : undefined;
}

/** Parse a number from various inputs. Returns undefined if not a valid number. */
export function parseNum(value: unknown): number | undefined {
  if (typeof value === 'number' && !isNaN(value)) return value;
  if (typeof value === 'string') {
    const n = parseFloat(value);
    if (!isNaN(n)) return n;
  }
  return undefined;
}

/** Parse an integer from various inputs. Returns undefined if not valid. */
export function parseInt_(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isInteger(value)) return value;
  if (typeof value === 'string') {
    const n = parseInt(value, 10);
    if (!isNaN(n)) return n;
  }
  return undefined;
}

/**
 * Humanize a snake_case or camelCase field name.
 * 'forty_yard_dash' → 'Forty Yard Dash'
 * 'benchPress' → 'Bench Press'
 */
export function humanize(field: string): string {
  return field
    .replace(/_/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim();
}

// ─── Role Normalization ───────────────────────────────────────────────────────

const ROLE_MAP: Record<string, string> = {
  athlete: 'athlete',
  parent: 'athlete', // Parents stored as athlete with ParentData
  coach: 'coach',
  panel: 'coach',
  scout: 'coach',
  media: 'coach',
  service: 'coach',
  fan: 'athlete',
  'college-coach': 'coach',
  director: 'director',
  recruiter: 'recruiter',
};

/**
 * Normalize a legacy role string to a V3 UserRole.
 * Handles case-insensitivity, whitespace, and known aliases.
 */
export function normalizeRole(role: unknown): string {
  if (typeof role !== 'string') return 'athlete';
  const cleaned = role.trim().toLowerCase();
  return ROLE_MAP[cleaned] ?? 'athlete';
}

// ─── Progress Reporting ───────────────────────────────────────────────────────

export class ProgressReporter {
  private startTime: number;
  private lastReport: number;
  private readonly label: string;

  constructor(label: string) {
    this.label = label;
    this.startTime = Date.now();
    this.lastReport = Date.now();
  }

  /** Write a progress update (overwrites current line in terminal) */
  tick(current: number, total?: number): void {
    const now = Date.now();
    // Only update every 250ms to avoid console spam
    if (now - this.lastReport < 250) return;
    this.lastReport = now;

    const elapsed = ((now - this.startTime) / 1000).toFixed(1);
    const rate = (current / ((now - this.startTime) / 1000)).toFixed(0);

    if (total) {
      const pct = ((current / total) * 100).toFixed(1);
      process.stdout.write(
        `\r  ${this.label}: ${current}/${total} (${pct}%) — ${elapsed}s — ${rate}/s`
      );
    } else {
      process.stdout.write(`\r  ${this.label}: ${current} processed — ${elapsed}s — ${rate}/s`);
    }
  }

  /** Print final line (moves to new line) */
  done(total: number): void {
    const elapsed = ((Date.now() - this.startTime) / 1000).toFixed(1);
    console.log(`\r  ${this.label}: ${total} processed in ${elapsed}s                    `);
  }
}

// ─── Batch Writer ─────────────────────────────────────────────────────────────

export class BatchWriter {
  private batch: FirebaseFirestore.WriteBatch;
  private count = 0;
  private totalWrites = 0;
  private totalErrors = 0;
  private readonly db: Firestore;
  private readonly dryRun: boolean;

  constructor(db: Firestore, dryRun = false) {
    this.db = db;
    this.dryRun = dryRun;
    this.batch = db.batch();
  }

  /** Queue a set({ merge: true }) operation */
  set(ref: FirebaseFirestore.DocumentReference, data: Record<string, unknown>): void {
    if (this.dryRun) {
      this.totalWrites++;
      return;
    }
    this.batch.set(ref, data, { merge: true });
    this.count++;
  }

  /** Queue a direct set() operation (no merge) */
  setStrict(ref: FirebaseFirestore.DocumentReference, data: Record<string, unknown>): void {
    if (this.dryRun) {
      this.totalWrites++;
      return;
    }
    this.batch.set(ref, data);
    this.count++;
  }

  /** Flush the batch if it has reached BATCH_SIZE */
  async flushIfNeeded(): Promise<void> {
    if (this.count >= BATCH_SIZE) {
      await this.flush();
    }
  }

  /** Force flush the current batch */
  async flush(): Promise<void> {
    if (this.count === 0) return;
    if (this.dryRun) {
      this.count = 0;
      return;
    }
    try {
      await this.batch.commit();
      this.totalWrites += this.count;
    } catch (err) {
      this.totalErrors += this.count;
      console.error(`\n  ❌ Batch commit failed (${this.count} ops):`, err);
    }
    this.count = 0;
    this.batch = this.db.batch();
  }

  /** Get stats */
  get stats(): { writes: number; errors: number } {
    return { writes: this.totalWrites, errors: this.totalErrors };
  }
}

// ─── Report Utilities ─────────────────────────────────────────────────────────

/** Print a header banner to the console */
export function printBanner(title: string): void {
  const line = '═'.repeat(title.length + 6);
  console.log(`╔${line}╗`);
  console.log(`║   ${title}   ║`);
  console.log(`╚${line}╝`);
  if (isDryRun) console.log('  [DRY RUN MODE — no writes]');
  console.log(`  Target: ${getTarget()}`);
  const limit = getLimit();
  if (limit > 0) console.log(`  Limit: ${limit} documents`);
  if (isVerbose) console.log('  Verbose: ON');
  console.log();
}

/** Write a JSON report to disk */
export function writeReport(filename: string, data: unknown): void {
  const reportDir = resolve(__dirname, '../../reports/migration');
  try {
    const { mkdirSync } = require('node:fs');
    mkdirSync(reportDir, { recursive: true });
  } catch {
    // Directory may already exist
  }
  const filePath = resolve(reportDir, filename);
  writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
  console.log(`\n  📄 Report saved: ${filePath}`);
}

/** Format a number with commas */
export function formatNum(n: number): string {
  return n.toLocaleString('en-US');
}

/** Print a summary table of key-value pairs */
export function printSummary(title: string, entries: Array<[string, string | number]>): void {
  console.log(`\n  ── ${title} ──`);
  const maxKey = Math.max(...entries.map(([k]) => k.length));
  for (const [key, value] of entries) {
    const display = typeof value === 'number' ? formatNum(value) : value;
    console.log(`    ${key.padEnd(maxKey + 2)} ${display}`);
  }
}

/** Print top-N from a record sorted by count descending */
export function printTopN(title: string, record: Record<string, number>, limit = 20): void {
  const sorted = Object.entries(record)
    .sort(([, a], [, b]) => b - a)
    .slice(0, limit);

  if (sorted.length === 0) return;

  console.log(`\n  ── ${title} (top ${Math.min(limit, sorted.length)}) ──`);
  const maxKey = Math.max(...sorted.map(([k]) => k.length));
  for (const [key, count] of sorted) {
    console.log(`    ${key.padEnd(maxKey + 2)} ${formatNum(count)}`);
  }
}

// ─── Safe JSON Parse ──────────────────────────────────────────────────────────

/** Safely parse a JSON string, returning null on failure */
export function safeJsonParse<T = unknown>(value: unknown): T | null {
  if (typeof value !== 'string') return null;
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}

// ─── Collection Constants ─────────────────────────────────────────────────────

export const COLLECTIONS = {
  // Legacy (source)
  LEGACY_USERS: 'Users',
  LEGACY_TEAMCODES: 'TeamCodes',

  // V2 Target
  USERS: 'users',
  ORGANIZATIONS: 'organizations',
  TEAMS: 'teams',
  ROSTER_ENTRIES: 'rosterEntries',
  RECRUITING: 'recruiting',
  POSTS: 'posts',
  PLAYER_STATS: 'playerStats',
  GAME_STATS: 'gameStats',
  PLAYER_METRICS: 'PlayerMetrics',
  BILLING_CONTEXTS: 'BillingContexts',
} as const;

// ─── Migration Metadata ───────────────────────────────────────────────────────

/** Standard metadata fields added to every migrated document */
export function migrationMeta(legacyId: string, sourceCollection: string): Record<string, unknown> {
  return {
    _legacyId: legacyId,
    _migratedAt: new Date().toISOString(),
    _migratedFrom: `nxt-1-de054/${sourceCollection}`,
    _schemaVersion: 3,
  };
}
