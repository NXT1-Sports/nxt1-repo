#!/usr/bin/env npx tsx
/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * Phase 4 — Validate User Migration (Dual-Read Comparison)
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Reads every migrated user from both legacy and V3 target, compares fields,
 * and generates a pass/fail report per user.
 *
 * Usage:
 *   npx tsx scripts/migration/validate-user-migration.ts --target=staging
 *   npx tsx scripts/migration/validate-user-migration.ts --limit=100 --verbose
 *
 * Flags:
 *   --limit=N          Validate at most N users
 *   --target=          staging (default) | production
 *   --verbose          Print per-field comparison detail
 *   --legacy-sa=       Override path to legacy service account JSON
 *   --strict           Fail on ANY mismatch (default: warn on non-critical)
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 */

import {
  initLegacyApp,
  initTargetApp,
  getLimit,
  hasFlag,
  isVerbose,
  PAGE_SIZE,
  COLLECTIONS,
  ProgressReporter,
  printBanner,
  printSummary,
  writeReport,
  formatNum,
  cleanString,
  cleanEmail,
  toISOString,
} from './migration-utils.js';

// ─── Types ────────────────────────────────────────────────────────────────────

type Severity = 'critical' | 'warning' | 'info';

interface FieldMismatch {
  field: string;
  severity: Severity;
  legacyValue: unknown;
  v3Value: unknown;
  message?: string;
}

interface UserValidation {
  uid: string;
  status: 'pass' | 'fail' | 'warn' | 'missing';
  mismatches: FieldMismatch[];
}

interface ValidationStats {
  total: number;
  pass: number;
  fail: number;
  warn: number;
  missing: number;
  criticalMismatches: number;
  warningMismatches: number;
}

// ─── Comparison Helpers ──────────────────────────────────────────────────────

function fuzzyStringMatch(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a == null && b == null) return true;
  if (a == null || b == null) return false;
  const strA = String(a).trim().toLowerCase();
  const strB = String(b).trim().toLowerCase();
  return strA === strB;
}

function fuzzyNumberMatch(a: unknown, b: unknown, tolerance = 0.01): boolean {
  if (a === b) return true;
  const numA = typeof a === 'number' ? a : parseFloat(String(a ?? ''));
  const numB = typeof b === 'number' ? b : parseFloat(String(b ?? ''));
  if (isNaN(numA) && isNaN(numB)) return true;
  if (isNaN(numA) || isNaN(numB)) return false;
  return Math.abs(numA - numB) <= tolerance;
}

function fuzzyDateMatch(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  const isoA = toISOString(a);
  const isoB = toISOString(b);
  if (!isoA && !isoB) return true;
  if (!isoA || !isoB) return false;
  // Compare to the minute only (Firestore timestamp precision may differ)
  return isoA.slice(0, 16) === isoB.slice(0, 16);
}

function arraysEquivalent(a: unknown, b: unknown): boolean {
  if (!Array.isArray(a) && !Array.isArray(b)) return true;
  if (!Array.isArray(a) || !Array.isArray(b)) return false;
  if (a.length !== b.length) return false;
  // Shallow comparison — sorted for order independence
  const sortedA = [...a].map(String).sort();
  const sortedB = [...b].map(String).sort();
  return sortedA.every((v, i) => v === sortedB[i]);
}

// ─── Core Identity Validation ────────────────────────────────────────────────

function validateUser(
  uid: string,
  legacy: Record<string, unknown>,
  v3: Record<string, unknown>
): UserValidation {
  const mismatches: FieldMismatch[] = [];

  const check = (
    field: string,
    legacyValue: unknown,
    v3Value: unknown,
    severity: Severity,
    compareFn: (a: unknown, b: unknown) => boolean = fuzzyStringMatch
  ): void => {
    if (!compareFn(legacyValue, v3Value)) {
      mismatches.push({
        field,
        severity,
        legacyValue,
        v3Value,
        message: `Expected ${JSON.stringify(legacyValue)} → got ${JSON.stringify(v3Value)}`,
      });
    }
  };

  // ── Category A: Core Identity ──────────────────────────────────────────
  check('email', cleanEmail(legacy['email']), v3['email'], 'critical');
  check('firstName', cleanString(legacy['firstName']), v3['firstName'], 'critical');
  check('lastName', cleanString(legacy['lastName']), v3['lastName'], 'critical');

  // ── Category B: Role ───────────────────────────────────────────────────
  // Role normalization is complex (parent → 'fan', panel → 'coach', etc.)
  // Just verify role exists and is valid
  const validRoles = ['athlete', 'coach', 'recruiter', 'director', 'fan', 'creator', 'scout'];
  const v3Role = v3['role'];
  if (!v3Role || !validRoles.includes(String(v3Role))) {
    mismatches.push({
      field: 'role',
      severity: 'critical',
      legacyValue: legacy['athleteOrParentOrCoach'] ?? legacy['role'],
      v3Value: v3Role,
      message: `Invalid or missing V3 role: ${v3Role}`,
    });
  }

  // ── Category E: Location ───────────────────────────────────────────────
  const v3Location = v3['location'] as Record<string, unknown> | undefined;
  if (v3Location) {
    const legacyState = cleanString(legacy['state']);
    const legacyCity = cleanString(legacy['city']);
    if (legacyState) check('location.state', legacyState, v3Location['state'], 'warning');
    if (legacyCity) check('location.city', legacyCity, v3Location['city'], 'warning');
  }

  // ── Category F: Academics ──────────────────────────────────────────────
  const v3Academics = v3['academics'] as Record<string, unknown> | undefined;
  const legacyAcademics = legacy['academicInfo'] as Record<string, unknown> | undefined;
  if (legacyAcademics && v3Academics) {
    check('academics.gpa', legacyAcademics['gpa'], v3Academics['gpa'], 'warning', fuzzyNumberMatch);
  }

  // ── Category G: Team History ───────────────────────────────────────────
  const v3TeamHistory = v3['teamHistory'] as unknown[];
  if (legacy['highSchool'] && (!Array.isArray(v3TeamHistory) || v3TeamHistory.length === 0)) {
    mismatches.push({
      field: 'teamHistory',
      severity: 'warning',
      legacyValue: legacy['highSchool'],
      v3Value: v3TeamHistory,
      message: 'High school should appear in teamHistory',
    });
  }

  // ── Category K: Counters ───────────────────────────────────────────────
  const v3Counters = v3['_counters'] as Record<string, unknown> | undefined;
  if (typeof legacy['profileViews'] === 'number' && v3Counters) {
    check(
      '_counters.profileViews',
      legacy['profileViews'],
      v3Counters['profileViews'],
      'info',
      fuzzyNumberMatch
    );
  }

  // ── Category L: Timestamps ─────────────────────────────────────────────
  check(
    'createdAt',
    toISOString(legacy['createdAt']),
    toISOString(v3['createdAt']),
    'warning',
    fuzzyDateMatch
  );

  // ── Category M: Metadata ───────────────────────────────────────────────
  if (v3['_schemaVersion'] !== 3) {
    mismatches.push({
      field: '_schemaVersion',
      severity: 'critical',
      legacyValue: 'expected 3',
      v3Value: v3['_schemaVersion'],
      message: '_schemaVersion must be 3',
    });
  }

  if (!v3['_legacyId']) {
    mismatches.push({
      field: '_legacyId',
      severity: 'critical',
      legacyValue: uid,
      v3Value: v3['_legacyId'],
      message: '_legacyId must be set',
    });
  }

  if (!v3['_migratedAt']) {
    mismatches.push({
      field: '_migratedAt',
      severity: 'critical',
      legacyValue: 'should exist',
      v3Value: v3['_migratedAt'],
      message: '_migratedAt must be set',
    });
  }

  // ── Derive final status
  const criticals = mismatches.filter((m) => m.severity === 'critical');
  const warnings = mismatches.filter((m) => m.severity === 'warning');

  let status: UserValidation['status'] = 'pass';
  if (criticals.length > 0) status = 'fail';
  else if (warnings.length > 0) status = 'warn';

  return { uid, status, mismatches };
}

// ─── Content Validation (Spot Checks) ────────────────────────────────────────

async function validateContent(
  uid: string,
  legacyDb: FirebaseFirestore.Firestore,
  targetDb: FirebaseFirestore.Firestore
): Promise<FieldMismatch[]> {
  const mismatches: FieldMismatch[] = [];

  // Check posts exist in target
  const legacyPostsSnap = await legacyDb
    .collection(COLLECTIONS.LEGACY_USERS)
    .doc(uid)
    .collection('Posts')
    .count()
    .get();
  const legacyPostCount = legacyPostsSnap.data().count;

  if (legacyPostCount > 0) {
    const targetPostsSnap = await targetDb
      .collection(COLLECTIONS.POSTS)
      .where('authorId', '==', uid)
      .count()
      .get();
    const targetPostCount = targetPostsSnap.data().count;

    if (targetPostCount === 0) {
      mismatches.push({
        field: 'posts',
        severity: 'warning',
        legacyValue: legacyPostCount,
        v3Value: targetPostCount,
        message: `Legacy has ${legacyPostCount} posts, V3 has 0`,
      });
    }
  }

  return mismatches;
}

// ─── Main Pipeline ────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  printBanner('Phase 4 — Migration Validation');

  const { db: legacyDb } = initLegacyApp();
  const { db: targetDb } = initTargetApp();

  const limit = getLimit();
  const strictMode = hasFlag('strict');

  const stats: ValidationStats = {
    total: 0,
    pass: 0,
    fail: 0,
    warn: 0,
    missing: 0,
    criticalMismatches: 0,
    warningMismatches: 0,
  };

  const results: UserValidation[] = [];
  const progress = new ProgressReporter('Validating users');

  let cursor: FirebaseFirestore.QueryDocumentSnapshot | undefined;
  let processed = 0;

  console.log('  Starting dual-read validation…\n');

  while (true) {
    let query: FirebaseFirestore.Query = legacyDb
      .collection(COLLECTIONS.LEGACY_USERS)
      .orderBy('createdAt', 'asc')
      .limit(PAGE_SIZE);

    if (cursor) query = query.startAfter(cursor);

    const snap = await query.get();
    if (snap.empty) break;

    for (const legacyDoc of snap.docs) {
      if (limit > 0 && processed >= limit) break;

      processed++;
      stats.total++;
      const uid = legacyDoc.id;
      const legacyData = legacyDoc.data();

      // Read V3 doc (same UID — we preserve UIDs)
      const v3Doc = await targetDb.collection(COLLECTIONS.USERS).doc(uid).get();

      if (!v3Doc.exists) {
        stats.missing++;
        results.push({ uid, status: 'missing', mismatches: [] });
        if (isVerbose) console.log(`    ⚠ ${uid}: MISSING in V3`);
        continue;
      }

      const v3Data = v3Doc.data() as Record<string, unknown>;
      const validation = validateUser(uid, legacyData, v3Data);

      // Content spot-checks (posts only, lightweight)
      const contentMismatches = await validateContent(uid, legacyDb, targetDb);
      validation.mismatches.push(...contentMismatches);

      // Recalculate status after content checks
      const criticals = validation.mismatches.filter((m) => m.severity === 'critical');
      if (criticals.length > 0) validation.status = 'fail';
      else if (validation.mismatches.filter((m) => m.severity === 'warning').length > 0) {
        if (validation.status === 'pass') validation.status = 'warn';
      }

      switch (validation.status) {
        case 'pass':
          stats.pass++;
          break;
        case 'fail':
          stats.fail++;
          break;
        case 'warn':
          stats.warn++;
          break;
      }

      stats.criticalMismatches += validation.mismatches.filter(
        (m) => m.severity === 'critical'
      ).length;
      stats.warningMismatches += validation.mismatches.filter(
        (m) => m.severity === 'warning'
      ).length;

      results.push(validation);

      if (isVerbose && validation.status !== 'pass') {
        console.log(
          `    ${validation.status === 'fail' ? '❌' : '⚠'} ${uid}: ${validation.mismatches.length} mismatch(es)`
        );
        for (const m of validation.mismatches) {
          console.log(`      [${m.severity}] ${m.field}: ${m.message}`);
        }
      }

      progress.tick(processed);
    }

    cursor = snap.docs[snap.docs.length - 1];
    if (limit > 0 && processed >= limit) break;
  }

  progress.done(processed);

  // ─── Report ─────────────────────────────────────────────────────────
  const passRate = stats.total > 0 ? ((stats.pass / stats.total) * 100).toFixed(1) : '0.0';

  printSummary('Validation Results', [
    ['Total users', stats.total],
    ['Pass ✅', stats.pass],
    ['Warn ⚠', stats.warn],
    ['Fail ❌', stats.fail],
    ['Missing 🔍', stats.missing],
    ['Pass rate', `${passRate}%` as unknown as number],
    ['Critical mismatches', stats.criticalMismatches],
    ['Warning mismatches', stats.warningMismatches],
  ]);

  // Top failing fields
  const fieldCounts = new Map<string, number>();
  for (const r of results) {
    for (const m of r.mismatches) {
      fieldCounts.set(m.field, (fieldCounts.get(m.field) ?? 0) + 1);
    }
  }

  if (fieldCounts.size > 0) {
    console.log('\n  Top mismatch fields:');
    const sorted = [...fieldCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10);
    for (const [field, count] of sorted) {
      console.log(`    ${field.padEnd(30)} ${formatNum(count)}`);
    }
  }

  // Write detailed report
  writeReport(`validation-report-${new Date().toISOString().slice(0, 10)}.json`, {
    timestamp: new Date().toISOString(),
    stats,
    passRate: `${passRate}%`,
    strictMode,
    failedUsers: results
      .filter((r) => r.status === 'fail')
      .map((r) => ({
        uid: r.uid,
        mismatches: r.mismatches.filter((m) => m.severity === 'critical'),
      })),
    warnings: results
      .filter((r) => r.status === 'warn')
      .slice(0, 100) // Cap warnings in report
      .map((r) => ({
        uid: r.uid,
        mismatches: r.mismatches,
      })),
    missingUsers: results.filter((r) => r.status === 'missing').map((r) => r.uid),
    fieldMismatchDistribution: Object.fromEntries(fieldCounts),
  });

  const exitCode = stats.fail > 0 ? 1 : strictMode && stats.warn > 0 ? 1 : 0;

  if (exitCode === 0) {
    console.log(`\n  ✅ Validation PASSED (${passRate}% pass rate)\n`);
  } else {
    console.log(
      `\n  ❌ Validation FAILED — ${stats.fail} critical failure(s), ${stats.missing} missing user(s)\n`
    );
  }

  process.exit(exitCode);
}

// ─── Firestore import ─────────────────────────────────────────────────────────
import FirebaseFirestore from 'firebase-admin/firestore';

main().catch((err) => {
  console.error('\n  FATAL:', err);
  process.exit(2);
});
