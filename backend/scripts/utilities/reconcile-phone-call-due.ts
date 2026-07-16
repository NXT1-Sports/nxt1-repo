import 'dotenv/config';

import { db as productionDb } from '../../src/utils/firebase.js';
import { stagingDb } from '../../src/utils/firebase-staging.js';
import type { RuntimeEnvironment } from '../../src/config/runtime-environment.js';
import {
  runB2BPhoneCallDueReconciliation,
  type B2BPhoneCallDueReconciliationCandidate,
} from '../../src/services/marketing/lifecycle/b2b-outbound-automation.service.js';
import {
  runInvestorsPartnershipsPhoneCallDueReconciliation,
  type InvestorsPartnershipsPhoneCallDueReconciliationCandidate,
} from '../../src/services/marketing/lifecycle/investors-partnerships-outbound-automation.service.js';

type Target = 'all' | 'b2b' | 'investors';

const args = process.argv.slice(2);

function hasFlag(flag: string): boolean {
  return args.includes(flag);
}

function getArg(name: string): string | null {
  return (
    args
      .find((arg) => arg.startsWith(`--${name}=`))
      ?.split('=')
      .slice(1)
      .join('=') ?? null
  );
}

function resolveEnvironment(): RuntimeEnvironment {
  return getArg('env') === 'production' ? 'production' : 'staging';
}

function resolveTarget(): Target {
  const target = getArg('target');
  return target === 'b2b' || target === 'investors' ? target : 'all';
}

function parsePositiveInteger(value: string | null): number | undefined {
  if (!value) return undefined;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

function formatDate(value: string | null): string {
  return value ?? 'n/a';
}

function printB2BSample(candidates: readonly B2BPhoneCallDueReconciliationCandidate[]): void {
  for (const candidate of candidates.slice(0, 10)) {
    console.log(
      ` - ${candidate.organization} | ${candidate.email ?? 'no-email'} | ${candidate.status} | touches=${candidate.touchCount} | last=${formatDate(candidate.lastContactedAt)}`
    );
  }

  if (candidates.length > 10) {
    console.log(` ... and ${candidates.length - 10} more`);
  }
}

function printInvestorsSample(
  candidates: readonly InvestorsPartnershipsPhoneCallDueReconciliationCandidate[]
): void {
  for (const candidate of candidates.slice(0, 10)) {
    console.log(
      ` - ${candidate.organization} | ${candidate.email ?? 'no-email'} | ${candidate.leadType} | ${candidate.status} | touches=${candidate.touchCount} | last=${formatDate(candidate.lastContactedAt)}`
    );
  }

  if (candidates.length > 10) {
    console.log(` ... and ${candidates.length - 10} more`);
  }
}

async function main(): Promise<void> {
  const environment = resolveEnvironment();
  const target = resolveTarget();
  const limit = parsePositiveInteger(getArg('limit'));
  const shouldCommit = hasFlag('--commit');
  const firestore = environment === 'production' ? productionDb : stagingDb;

  console.log(`[reconcile-phone-call-due] Environment: ${environment.toUpperCase()}`);
  console.log(`[reconcile-phone-call-due] Target: ${target}`);
  console.log(`[reconcile-phone-call-due] Mode: ${shouldCommit ? 'COMMIT' : 'DRY RUN'}`);
  if (limit) {
    console.log(`[reconcile-phone-call-due] Lead scan limit: ${limit}`);
  }

  if (target === 'all' || target === 'b2b') {
    const result = await runB2BPhoneCallDueReconciliation({
      db: firestore,
      environment,
      limit,
      dryRun: !shouldCommit,
    });

    console.log(
      `[reconcile-phone-call-due] B2B inspected=${result.inspected} eligible=${result.eligible} updated=${result.updated}`
    );
    printB2BSample(result.candidates);
  }

  if (target === 'all' || target === 'investors') {
    const result = await runInvestorsPartnershipsPhoneCallDueReconciliation({
      db: firestore,
      environment,
      limit,
      dryRun: !shouldCommit,
    });

    console.log(
      `[reconcile-phone-call-due] Investors inspected=${result.inspected} eligible=${result.eligible} updated=${result.updated}`
    );
    printInvestorsSample(result.candidates);
  }

  if (!shouldCommit) {
    console.log('[reconcile-phone-call-due] Dry run complete. Re-run with --commit to apply.');
  }
}

main().catch((error) => {
  console.error('[reconcile-phone-call-due] Failed:', error);
  process.exit(1);
});
