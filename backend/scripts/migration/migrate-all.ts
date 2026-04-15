#!/usr/bin/env npx tsx
/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * MASTER MIGRATION ORCHESTRATOR
 * NXT1 Legacy (nxt-1-de054) → Staging V2 (nxt-1-staging-v2)
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Runs all migration phases in the correct order for the canary users defined
 * in user-uid-mapping.json.
 *
 * Pipeline (in order):
 *   Phase 1  — Auth: pre-cleanup + import users + fix emails
 *   Phase 2  — Firestore Users: migrate Users collection (V3 schema)
 *   Phase 3  — Unicodes: create Unicodes collection docs
 *   Phase 4  — TeamCodes → Organizations + Teams + RosterEntries
 *   Phase 5  — User Content: Recruiting, Posts, Stats sub-collections
 *   Phase 6  — Storage: copy profile images + rewrite URLs
 *
 * Usage:
 *   npx tsx scripts/migration/migrate-all.ts --dry-run
 *   npx tsx scripts/migration/migrate-all.ts
 *   npx tsx scripts/migration/migrate-all.ts --skip-auth
 *   npx tsx scripts/migration/migrate-all.ts --skip-storage
 *   npx tsx scripts/migration/migrate-all.ts --only=users,unicodes,teamcodes
 *
 * Flags:
 *   --dry-run        Log all operations but write nothing (passed to sub-scripts)
 *   --verbose        Verbose output (passed to sub-scripts)
 *   --skip-auth      Skip Phase 1 (auth already migrated)
 *   --skip-storage   Skip Phase 6 (storage already migrated or run separately)
 *   --only=p1,p2     Run only listed phases: auth,users,unicodes,teamcodes,content,storage
 *   --limit=N        Limit docs per sub-script (for testing)
 * ═══════════════════════════════════════════════════════════════════════════════
 */

import { execSync, spawnSync } from 'child_process';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ─── CLI Parsing ──────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const isDryRun = args.includes('--dry-run');
const isVerbose = args.includes('--verbose');
const skipAuth = args.includes('--skip-auth');
const skipStorage = args.includes('--skip-storage');

function getArg(name: string): string | null {
  const prefixed = `--${name}=`;
  const found = args.find((a) => a.startsWith(prefixed));
  return found ? found.slice(prefixed.length) : null;
}

const onlyArg = getArg('only');
const onlyPhases = onlyArg ? new Set(onlyArg.split(',').map((s) => s.trim().toLowerCase())) : null;
const limitArg = getArg('limit');

function shouldRun(phase: string): boolean {
  if (onlyPhases) return onlyPhases.has(phase);
  if (phase === 'auth' && skipAuth) return false;
  if (phase === 'storage' && skipStorage) return false;
  return true;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const SCRIPTS_DIR = __dirname;

interface StepResult {
  phase: string;
  label: string;
  success: boolean;
  skipped: boolean;
  durationMs: number;
  error?: string;
}

function banner(title: string) {
  const line = '═'.repeat(65);
  console.log(`\n${line}`);
  console.log(`  ${title}`);
  console.log(line);
}

function sectionHeader(phase: string, label: string) {
  console.log(`\n${'─'.repeat(65)}`);
  console.log(`  [${phase.toUpperCase()}]  ${label}`);
  console.log(`${'─'.repeat(65)}\n`);
}

/**
 * Run a TypeScript migration script via tsx, forwarding relevant flags.
 * Returns true on success, false on failure.
 */
function runScript(
  scriptName: string,
  extraArgs: string[] = []
): { success: boolean; error?: string } {
  const scriptPath = resolve(SCRIPTS_DIR, scriptName);

  const forwarded: string[] = [];
  if (isDryRun) forwarded.push('--dry-run');
  if (isVerbose) forwarded.push('--verbose');
  if (limitArg) forwarded.push(`--limit=${limitArg}`);

  const allArgs = [...forwarded, ...extraArgs];
  const cmd = ['npx', 'tsx', scriptPath, ...allArgs];

  console.log(`  $ ${cmd.join(' ')}\n`);

  const result = spawnSync(cmd[0], cmd.slice(1), {
    stdio: 'inherit',
    cwd: resolve(__dirname, '../..'),
    env: process.env,
  });

  if (result.status !== 0) {
    return {
      success: false,
      error: `Exit code ${result.status ?? 'unknown'}${result.error ? ': ' + result.error.message : ''}`,
    };
  }
  return { success: true };
}

/**
 * Run a phase, record timing and result.
 */
async function runPhase(
  phase: string,
  label: string,
  fn: () => { success: boolean; error?: string }
): Promise<StepResult> {
  if (!shouldRun(phase)) {
    console.log(`  ⏭  Skipping [${phase}] ${label}`);
    return { phase, label, success: true, skipped: true, durationMs: 0 };
  }

  sectionHeader(phase, label);
  const start = Date.now();

  const { success, error } = fn();
  const durationMs = Date.now() - start;

  if (success) {
    console.log(`\n  ✅  [${phase}] completed in ${(durationMs / 1000).toFixed(1)}s`);
  } else {
    console.error(`\n  ❌  [${phase}] FAILED after ${(durationMs / 1000).toFixed(1)}s: ${error}`);
  }

  return { phase, label, success, skipped: false, durationMs, error };
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  banner('MASTER MIGRATION — Legacy → Staging V2');
  console.log(`  Mode     : ${isDryRun ? 'DRY RUN (no writes)' : '⚡  LIVE'}`);
  console.log(`  Verbose  : ${isVerbose}`);
  console.log(`  Skip Auth: ${skipAuth}`);
  console.log(`  Skip Storage: ${skipStorage}`);
  if (onlyPhases) console.log(`  Only phases: ${[...onlyPhases].join(', ')}`);
  if (limitArg) console.log(`  Limit: ${limitArg} docs per script`);
  console.log();

  if (!isDryRun) {
    console.log('  ⚠️   LIVE MODE — data will be written to nxt-1-staging-v2');
    console.log('       Press Ctrl+C within 5 seconds to abort...');
    await new Promise((r) => setTimeout(r, 5000));
    console.log('  Proceeding...\n');
  }

  const results: StepResult[] = [];

  // ── Phase 1: Authentication ─────────────────────────────────────────────────
  // Handles: pre-cleanup, firebase auth:import with SCRYPT hash, fix missing emails
  results.push(
    await runPhase('auth', 'Firebase Authentication (import users + fix emails)', () =>
      runScript('migrate-auth-master.ts')
    )
  );

  if (results.at(-1)?.success === false) {
    console.error('\n  🛑  HALTING: Auth phase failed. Fix errors before continuing.');
    printSummary(results);
    process.exit(1);
  }

  // ── Phase 2: Firestore Users ────────────────────────────────────────────────
  // Maps legacy Users → V3 users schema (all 14 field categories)
  results.push(
    await runPhase('users', 'Firestore Users Collection (V3 schema migration)', () =>
      runScript('migrate-target-users-data.ts', ['--apply'])
    )
  );

  // ── Phase 3: Unicodes ───────────────────────────────────────────────────────
  // Creates Unicodes collection entries for all migrated users
  results.push(
    await runPhase('unicodes', 'Unicodes Collection', () =>
      runScript('migrate-unicodes.ts', ['--target-users'])
    )
  );

  // ── Phase 4: TeamCodes → Organizations + Teams + RosterEntries ─────────────
  // For each canary user: fetches their TeamCode, creates Org + Team + RosterEntries
  results.push(
    await runPhase('teamcodes', 'TeamCodes → Organizations + Teams + RosterEntries', () =>
      runScript('migrate-target-teamcodes.ts')
    )
  );

  // ── Phase 5: User Content ───────────────────────────────────────────────────
  // Migrates sub-collections: RecruitingActivity, Posts, Stats
  results.push(
    await runPhase('content', 'User Content (Recruiting, Posts, Stats)', () =>
      runScript('migrate-user-content-to-v2.ts')
    )
  );

  // ── Phase 6: Storage / Profile Images ──────────────────────────────────────
  // Copies profile images from legacy bucket and rewrites Firestore URLs
  results.push(
    await runPhase('storage', 'Storage — Profile Images (copy + rewrite URLs)', () =>
      runScript('migrate-profile-images.ts', ['--apply'])
    )
  );

  // ── Summary ─────────────────────────────────────────────────────────────────
  printSummary(results);

  const anyFailed = results.some((r) => !r.success && !r.skipped);
  process.exit(anyFailed ? 1 : 0);
}

function printSummary(results: StepResult[]) {
  banner('MIGRATION SUMMARY');
  const total = (ms: number) => `${(ms / 1000).toFixed(1)}s`;

  for (const r of results) {
    const icon = r.skipped ? '⏭ ' : r.success ? '✅' : '❌';
    const status = r.skipped ? 'SKIPPED' : r.success ? 'OK' : 'FAILED';
    const dur = r.skipped ? '' : `  (${total(r.durationMs)})`;
    console.log(`  ${icon}  [${r.phase.padEnd(10)}]  ${r.label.padEnd(55)} ${status}${dur}`);
    if (r.error) console.log(`             └─ ${r.error}`);
  }

  const ran = results.filter((r) => !r.skipped);
  const passed = ran.filter((r) => r.success).length;
  const failed = ran.filter((r) => !r.success).length;
  const totalMs = ran.reduce((s, r) => s + r.durationMs, 0);

  console.log();
  console.log(`  Phases ran: ${ran.length}  ✅ ${passed} passed  ❌ ${failed} failed`);
  console.log(`  Total time: ${total(totalMs)}`);
  if (isDryRun) {
    console.log('\n  ℹ️   DRY RUN — no data was written to Firestore or Storage.');
  }
  console.log();
}

main().catch((err) => {
  console.error('Fatal error in migrate-all.ts:', err);
  process.exit(1);
});
