/**
 * @fileoverview Legacy Subscription Migration Recipient Credits
 * @module @nxt1/backend/services/marketing/email/campaigns/legacy/legacy-subscription-migration-recipients
 *
 * Source of truth for one-time migration wallet credits used in
 * legacy subscription -> usage billing communications.
 */

const LEGACY_MIGRATION_CREDIT_CENTS: Readonly<Record<string, number>> = {
  'elitecc236@icloud.com': 1200,
  'gailpaul30@gmail.com': 1200,
  'julianrmayers@gmail.com': 4550,
  'kayleebritten2026recruit@gmail.com': 4550,
  'lukefrayer@gmail.com': 1200,
  'michael.uland@hotmail.com': 1200,
  'nickjoeg@icloud.com': 4550,
  'nturcotte11@yahoo.com': 4550,
  'paytonmc22@gmail.com': 1200,
  'skymarshall0820@gmail.com': 1200,
  'torreypaul@gmail.com': 6500,
  'vrupinta@yahoo.com': 3500,
};

export function getLegacyMigrationCreditCents(email: string): number | null {
  const normalized = email.trim().toLowerCase();
  return LEGACY_MIGRATION_CREDIT_CENTS[normalized] ?? null;
}
