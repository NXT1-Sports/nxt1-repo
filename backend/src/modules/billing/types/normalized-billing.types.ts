/**
 * @fileoverview Normalized Billing Firestore Types
 * @module @nxt1/backend/modules/billing
 */

import type { Timestamp } from 'firebase-admin/firestore';
import type {
  BudgetInterval,
  BillingOwnerType,
  BillingPreference,
  PeriodLedger,
  Wallet,
} from '@nxt1/core/usage';

export const NORMALIZED_BILLING_SCHEMA_VERSION = 1;

const ORGANIZATION_OWNER_PREFIX = 'org:';

export interface WalletDocument extends Wallet {
  readonly schemaVersion: typeof NORMALIZED_BILLING_SCHEMA_VERSION;
  readonly createdAt: Timestamp;
  readonly updatedAt: Timestamp;
}

export interface BillingPreferenceDocument extends Omit<BillingPreference, 'autoTopUpLockedAt'> {
  readonly schemaVersion: typeof NORMALIZED_BILLING_SCHEMA_VERSION;
  readonly autoTopUpLockedAt?: Timestamp;
  readonly createdAt: Timestamp;
  readonly updatedAt: Timestamp;
}

export interface PeriodLedgerDocument extends PeriodLedger {
  readonly schemaVersion: typeof NORMALIZED_BILLING_SCHEMA_VERSION;
  readonly createdAt: Timestamp;
  readonly updatedAt: Timestamp;
}

export function createBillingOwnerKey(ownerType: BillingOwnerType, ownerId: string): string {
  return ownerType === 'organization' ? `${ORGANIZATION_OWNER_PREFIX}${ownerId}` : ownerId;
}

export function parseBillingOwnerKey(ownerKey: string): {
  ownerId: string;
  ownerType: BillingOwnerType;
} {
  if (ownerKey.startsWith(ORGANIZATION_OWNER_PREFIX)) {
    return {
      ownerId: ownerKey.slice(ORGANIZATION_OWNER_PREFIX.length),
      ownerType: 'organization',
    };
  }

  return {
    ownerId: ownerKey,
    ownerType: 'individual',
  };
}

export function createWalletDocumentId(ownerType: BillingOwnerType, ownerId: string): string {
  return createBillingOwnerKey(ownerType, ownerId);
}

export function createBillingPreferenceDocumentId(
  ownerType: BillingOwnerType,
  ownerId: string
): string {
  return createBillingOwnerKey(ownerType, ownerId);
}

export function createPeriodLedgerDocumentId(
  ownerType: BillingOwnerType,
  ownerId: string,
  periodKey: string
): string {
  return `${createBillingOwnerKey(ownerType, ownerId)}:${periodKey}`;
}

export function createPeriodKey(
  periodStart: string,
  fallbackDate: Date = new Date(),
  interval: BudgetInterval = 'monthly'
): string {
  if (/^\d{4}-\d{2}-\d{2}/.test(periodStart)) {
    if (interval === 'daily' || interval === 'weekly') {
      return periodStart.slice(0, 10);
    }
    return periodStart.slice(0, 7);
  }

  const year = fallbackDate.getUTCFullYear();
  const month = String(fallbackDate.getUTCMonth() + 1).padStart(2, '0');
  const day = String(fallbackDate.getUTCDate()).padStart(2, '0');

  if (interval === 'daily' || interval === 'weekly') {
    return `${year}-${month}-${day}`;
  }

  return `${year}-${month}`;
}
