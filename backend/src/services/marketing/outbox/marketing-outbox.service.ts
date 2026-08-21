/**
 * @fileoverview Marketing lifecycle outbox.
 * @module @nxt1/backend/services/marketing/outbox
 *
 * Durable queue for marketing, CRM, and reporting side effects. Core business
 * flows only write an outbox record; a background processor performs the
 * external Notion/Slack/email work later.
 */

import type { Firestore } from 'firebase-admin/firestore';
import type { AgentIdentifier, UserRole } from '@nxt1/core';
import type { RuntimeEnvironment } from '../../../config/runtime-environment.js';
import { logger } from '../../../utils/logger.js';
import { processAgentDeliverableGeneratedLifecycle } from '../lifecycle/agent-deliverable-generated-lifecycle.service.js';
import { processCompletedSignupLifecycle } from '../lifecycle/completed-signup-lifecycle.service.js';
import { recordB2CUsersAccountStartedEntry } from '../lifecycle/b2c-users.service.js';
import { recordB2CUsersClosedWonEntry } from '../lifecycle/b2c-users.service.js';
import { recordB2CUsersExpansionPricingEntry } from '../lifecycle/b2c-users.service.js';
import { recordB2CUsersOrganizationModeEntry } from '../lifecycle/b2c-users.service.js';
import { recordB2CUsersTrialCreditsFinishedEntry } from '../lifecycle/b2c-users.service.js';
import { recordB2CUsersUsageStartedEntry } from '../lifecycle/b2c-users.service.js';
import { recordChurnedNotionDashboardEntry } from '../lifecycle/churned-notion-dashboard.service.js';
import { recordClosedWonNotionDashboardEntry } from '../lifecycle/closed-won-notion-dashboard.service.js';
import { recordExpansionPricingNotionDashboardEntry } from '../lifecycle/expansion-pricing-notion-dashboard.service.js';
import { recordTrialCreditsFinishedNotionDashboardEntry } from '../lifecycle/trial-credits-finished-notion-dashboard.service.js';
import { recordUsageStartedNotionDashboardEntry } from '../lifecycle/usage-started-notion-dashboard.service.js';

export const MARKETING_OUTBOX_COLLECTION = 'MarketingOutbox';

export type MarketingOutboxStatus = 'pending' | 'processing' | 'completed' | 'failed';

export type MarketingOutboxEventType =
  | 'agent.deliverable_generated'
  | 'signup.started'
  | 'signup.completed'
  | 'billing.usage_started.organization'
  | 'billing.usage_started.individual'
  | 'billing.trial_credits_finished'
  | 'billing.subscription.churned.organization'
  | 'billing.purchase.closed_won.organization'
  | 'billing.purchase.expansion.organization'
  | 'billing.purchase.closed_won.individual'
  | 'billing.purchase.expansion.individual';

export interface MarketingOutboxRecord {
  readonly eventKey: string;
  readonly eventType: MarketingOutboxEventType;
  readonly status: MarketingOutboxStatus;
  readonly attempts: number;
  readonly environment: RuntimeEnvironment;
  readonly payload: Record<string, unknown>;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly processingStartedAt?: Date;
  readonly completedAt?: Date;
  readonly failedAt?: Date;
  readonly lastError?: string | null;
  readonly nextAttemptAt?: Date | null;
}

export interface EnqueueMarketingOutboxResult {
  readonly eventKey: string;
  readonly eventType: MarketingOutboxEventType;
  readonly deduplicated: boolean;
}

export interface ProcessMarketingOutboxInput {
  readonly db: Firestore;
  readonly limit?: number;
  readonly now?: Date;
}

export interface ProcessMarketingOutboxResult {
  readonly processedCount: number;
  readonly completedCount: number;
  readonly failedCount: number;
  readonly skippedCount: number;
}

export interface EnqueueSignupCompletedMarketingOutboxInput {
  readonly db: Firestore;
  readonly environment: RuntimeEnvironment;
  readonly userId: string;
  readonly role: UserRole;
  readonly firstName?: string | null;
  readonly lastName?: string | null;
  readonly displayName?: string | null;
  readonly email?: string | null;
  readonly primarySport?: string | null;
  readonly teamName?: string | null;
  readonly teamType?: string | null;
  readonly teamId?: string | null;
  readonly organizationId?: string | null;
  readonly city?: string | null;
  readonly state?: string | null;
  readonly phone?: string | null;
  readonly referralId?: string | null;
  readonly referralSource?: string | null;
  readonly referralDetails?: string | null;
  readonly teamCode?: string | null;
  readonly teamCodeName?: string | null;
  readonly marketingEnabled?: boolean;
  readonly slackAlertAlreadySent?: boolean;
  readonly welcomeEmailAlreadySent?: boolean;
  readonly notionDashboardAlreadySynced?: boolean;
  readonly b2cUsersAlreadySynced?: boolean;
}

export interface EnqueueAccountStartedMarketingOutboxInput {
  readonly db: Firestore;
  readonly environment: RuntimeEnvironment;
  readonly userId: string;
}

export interface EnqueueAgentDeliverableGeneratedMarketingOutboxInput {
  readonly db: Firestore;
  readonly environment: RuntimeEnvironment;
  readonly operationId: string;
  readonly userId: string;
  readonly threadId?: string;
  readonly agentId?: AgentIdentifier;
  readonly title?: string;
  readonly summary?: string;
  readonly deliverables: readonly {
    readonly url: string;
    readonly name: string;
    readonly type: 'image' | 'video';
    readonly mimeType?: string;
    readonly thumbnailUrl?: string;
    readonly storagePath?: string;
  }[];
}

export interface EnqueueUsageStartedMarketingOutboxInput {
  readonly db: Firestore;
  readonly environment: RuntimeEnvironment;
  readonly userId: string;
  readonly operationId: string;
  readonly feature: string;
  readonly chargeAmountCents: number;
  readonly organizationId?: string;
}

export interface EnqueueTrialCreditsFinishedMarketingOutboxInput {
  readonly db: Firestore;
  readonly environment: RuntimeEnvironment;
  readonly userId: string;
  readonly billingOwnerType: 'organization' | 'individual';
  readonly organizationId?: string;
  readonly operationId: string;
  readonly feature: string;
  readonly baselineCents: number;
  readonly newBalanceCents: number;
}

export interface EnqueueOrgSubscriptionChurnedMarketingOutboxInput {
  readonly db: Firestore;
  readonly environment: RuntimeEnvironment;
  readonly organizationId: string;
  readonly userId: string;
  readonly email?: string;
  readonly lastPaidAt: Date;
  readonly zeroBalanceSinceAt: Date;
  readonly balanceCents: number;
  readonly subscriptionId?: string;
}

export interface EnqueueOrgPurchaseMarketingOutboxInput {
  readonly db: Firestore;
  readonly environment: RuntimeEnvironment;
  readonly organizationId: string;
  readonly amountCents: number;
  readonly source:
    | 'stripe_checkout'
    | 'invoice_payment'
    | 'manual_credit'
    | 'direct_charge'
    | 'auto_topup';
  readonly initiatedByUserId?: string;
  readonly checkoutSessionId?: string;
  readonly invoiceId?: string;
}

export interface EnqueueIndividualPurchaseMarketingOutboxInput {
  readonly db: Firestore;
  readonly environment: RuntimeEnvironment;
  readonly userId: string;
  readonly amountCents: number;
  readonly source: 'stripe_checkout' | 'iap_topup';
}

function compactText(value: string | null | undefined): string | undefined {
  const normalized = value?.trim();
  return normalized && normalized.length > 0 ? normalized : undefined;
}

function buildEventKey(eventType: MarketingOutboxEventType, keyParts: readonly string[]): string {
  return [eventType, ...keyParts.map((part) => part.trim()).filter(Boolean)].join('::');
}

function normalizeLimit(limit: number | undefined): number {
  if (!Number.isFinite(limit ?? Number.NaN)) return 50;
  const normalized = Math.floor(limit ?? 50);
  if (normalized <= 0) return 50;
  return Math.min(normalized, 200);
}

function assertB2CUsersLifecycleNotFailed(
  result: { status: 'created' | 'existing' | 'skipped' | 'failed' | 'queued'; reason?: string },
  eventType: MarketingOutboxEventType,
  eventKey: string
): void {
  if (result.status === 'failed') {
    throw new Error(
      `B2C users lifecycle failed for ${eventType} (${eventKey})${
        result.reason ? `: ${result.reason}` : ''
      }`
    );
  }
}

function assertB2BNotionLifecycleCreated(
  result: { status: 'created' | 'skipped' | 'failed'; reason?: string },
  eventType: MarketingOutboxEventType,
  eventKey: string
): void {
  if (result.status === 'skipped' && result.reason === 'background-job') {
    return;
  }

  if (result.status !== 'created') {
    throw new Error(
      `B2B notion lifecycle did not complete for ${eventType} (${eventKey})${
        result.reason ? `: ${result.reason}` : ''
      }`
    );
  }
}

function isRetryableState(status: MarketingOutboxStatus): boolean {
  return status === 'pending' || status === 'failed';
}

async function enqueueMarketingOutboxEvent(input: {
  readonly db: Firestore;
  readonly eventKey: string;
  readonly eventType: MarketingOutboxEventType;
  readonly environment: RuntimeEnvironment;
  readonly payload: Record<string, unknown>;
}): Promise<EnqueueMarketingOutboxResult> {
  const ref = input.db.collection(MARKETING_OUTBOX_COLLECTION).doc(input.eventKey);

  return input.db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref);
    if (snapshot.exists) {
      const existing = snapshot.data() as Partial<MarketingOutboxRecord> | undefined;
      if (existing?.status && !isRetryableState(existing.status)) {
        return {
          eventKey: input.eventKey,
          eventType: input.eventType,
          deduplicated: true,
        };
      }

      transaction.set(
        ref,
        {
          eventKey: input.eventKey,
          eventType: input.eventType,
          environment: input.environment,
          payload: input.payload,
          status: 'pending' as MarketingOutboxStatus,
          attempts: typeof existing?.attempts === 'number' ? existing.attempts : 0,
          lastError: null,
          nextAttemptAt: null,
          updatedAt: new Date(),
          createdAt: existing?.createdAt instanceof Date ? existing.createdAt : new Date(),
        },
        { merge: true }
      );

      return {
        eventKey: input.eventKey,
        eventType: input.eventType,
        deduplicated: true,
      };
    }

    const now = new Date();
    const document: MarketingOutboxRecord = {
      eventKey: input.eventKey,
      eventType: input.eventType,
      environment: input.environment,
      payload: input.payload,
      status: 'pending',
      attempts: 0,
      lastError: null,
      createdAt: now,
      updatedAt: now,
    };

    transaction.set(ref, document);

    return {
      eventKey: input.eventKey,
      eventType: input.eventType,
      deduplicated: false,
    };
  });
}

async function claimMarketingOutboxEvent(input: {
  readonly db: Firestore;
  readonly eventKey: string;
  readonly now: Date;
}): Promise<MarketingOutboxRecord | null> {
  const ref = input.db.collection(MARKETING_OUTBOX_COLLECTION).doc(input.eventKey);

  return input.db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref);
    if (!snapshot.exists) return null;

    const record = snapshot.data() as Partial<MarketingOutboxRecord> | undefined;
    if (!record?.status || record.status === 'completed' || record.status === 'processing') {
      return null;
    }

    if (
      record.nextAttemptAt instanceof Date &&
      record.nextAttemptAt.getTime() > input.now.getTime()
    ) {
      return null;
    }

    const nextAttempts = (record.attempts ?? 0) + 1;
    const claimed: MarketingOutboxRecord = {
      eventKey: record.eventKey ?? input.eventKey,
      eventType: record.eventType ?? 'signup.completed',
      status: 'processing',
      attempts: nextAttempts,
      environment: record.environment ?? 'production',
      payload: record.payload ?? {},
      createdAt: record.createdAt instanceof Date ? record.createdAt : input.now,
      updatedAt: input.now,
      processingStartedAt: input.now,
      lastError: null,
    };

    transaction.set(
      ref,
      {
        status: 'processing' as MarketingOutboxStatus,
        attempts: nextAttempts,
        processingStartedAt: input.now,
        updatedAt: input.now,
        lastError: null,
      },
      { merge: true }
    );

    return claimed;
  });
}

async function markMarketingOutboxCompleted(input: {
  readonly db: Firestore;
  readonly eventKey: string;
  readonly now: Date;
}): Promise<void> {
  await input.db
    .collection(MARKETING_OUTBOX_COLLECTION)
    .doc(input.eventKey)
    .set(
      {
        status: 'completed' as MarketingOutboxStatus,
        completedAt: input.now,
        updatedAt: input.now,
        lastError: null,
      },
      { merge: true }
    );
}

async function markMarketingOutboxFailed(input: {
  readonly db: Firestore;
  readonly eventKey: string;
  readonly now: Date;
  readonly error: string;
  readonly attempts: number;
}): Promise<void> {
  const backoffMs = Math.min(60_000, 1_000 * 2 ** Math.max(0, input.attempts - 1));
  await input.db
    .collection(MARKETING_OUTBOX_COLLECTION)
    .doc(input.eventKey)
    .set(
      {
        status: 'failed' as MarketingOutboxStatus,
        failedAt: input.now,
        nextAttemptAt: new Date(input.now.getTime() + backoffMs),
        updatedAt: input.now,
        lastError: input.error.slice(0, 500),
      },
      { merge: true }
    );
}

async function processMarketingOutboxRecord(input: {
  readonly db: Firestore;
  readonly record: MarketingOutboxRecord;
}): Promise<void> {
  const { record } = input;

  switch (record.eventType) {
    case 'signup.started': {
      const payload = record.payload as Record<string, unknown>;
      const b2cUsersResult = await recordB2CUsersAccountStartedEntry({
        db: input.db,
        userId: String(payload['userId'] ?? ''),
        environment: (payload['environment'] as RuntimeEnvironment) ?? 'production',
      });
      assertB2CUsersLifecycleNotFailed(b2cUsersResult, record.eventType, record.eventKey);
      return;
    }

    case 'agent.deliverable_generated': {
      const payload = record.payload as Record<string, unknown>;
      const rawDeliverables = Array.isArray(payload['deliverables'])
        ? (payload['deliverables'] as Record<string, unknown>[])
        : [];

      await processAgentDeliverableGeneratedLifecycle({
        db: input.db,
        environment: (payload['environment'] as RuntimeEnvironment) ?? 'production',
        operationId: String(payload['operationId'] ?? ''),
        userId: String(payload['userId'] ?? ''),
        threadId: compactText(payload['threadId'] as string | null | undefined),
        agentId: compactText(payload['agentId'] as string | null | undefined) as
          | AgentIdentifier
          | undefined,
        title: compactText(payload['title'] as string | null | undefined),
        summary: compactText(payload['summary'] as string | null | undefined),
        deliverables: rawDeliverables
          .map((deliverable) => {
            const url = compactText(deliverable['url'] as string | null | undefined);
            const name = compactText(deliverable['name'] as string | null | undefined);
            const type = compactText(deliverable['type'] as string | null | undefined);
            if (!url || !name || (type !== 'image' && type !== 'video')) {
              return null;
            }

            return {
              url,
              name,
              type,
              ...(compactText(deliverable['mimeType'] as string | null | undefined)
                ? { mimeType: compactText(deliverable['mimeType'] as string | null | undefined) }
                : {}),
              ...(compactText(deliverable['thumbnailUrl'] as string | null | undefined)
                ? {
                    thumbnailUrl: compactText(
                      deliverable['thumbnailUrl'] as string | null | undefined
                    ),
                  }
                : {}),
              ...(compactText(deliverable['storagePath'] as string | null | undefined)
                ? {
                    storagePath: compactText(
                      deliverable['storagePath'] as string | null | undefined
                    ),
                  }
                : {}),
            };
          })
          .filter(
            (
              deliverable
            ): deliverable is {
              readonly url: string;
              readonly name: string;
              readonly type: 'image' | 'video';
              readonly mimeType?: string;
              readonly thumbnailUrl?: string;
              readonly storagePath?: string;
            } => Boolean(deliverable)
          ),
      });
      return;
    }

    case 'signup.completed': {
      const payload = record.payload as Record<string, unknown>;
      const completedSignupResult = await processCompletedSignupLifecycle({
        db: input.db,
        userId: String(payload['userId'] ?? ''),
        environment: (payload['environment'] as RuntimeEnvironment) ?? 'production',
        role: String(payload['role'] ?? 'athlete') as UserRole,
        firstName: (payload['firstName'] as string | null | undefined) ?? null,
        lastName: (payload['lastName'] as string | null | undefined) ?? null,
        displayName: (payload['displayName'] as string | null | undefined) ?? null,
        email: (payload['email'] as string | null | undefined) ?? null,
        primarySport: (payload['primarySport'] as string | null | undefined) ?? null,
        teamName: (payload['teamName'] as string | null | undefined) ?? null,
        teamType: (payload['teamType'] as string | null | undefined) ?? null,
        teamId: (payload['teamId'] as string | null | undefined) ?? null,
        organizationId: (payload['organizationId'] as string | null | undefined) ?? null,
        city: (payload['city'] as string | null | undefined) ?? null,
        state: (payload['state'] as string | null | undefined) ?? null,
        phone: (payload['phone'] as string | null | undefined) ?? null,
        referralId: (payload['referralId'] as string | null | undefined) ?? null,
        referralSource: (payload['referralSource'] as string | null | undefined) ?? null,
        referralDetails: (payload['referralDetails'] as string | null | undefined) ?? null,
        teamCode: (payload['teamCode'] as string | null | undefined) ?? null,
        teamCodeName: (payload['teamCodeName'] as string | null | undefined) ?? null,
        marketingEnabled: Boolean(payload['marketingEnabled'] ?? true),
        slackAlertAlreadySent: Boolean(payload['slackAlertAlreadySent'] ?? false),
        welcomeEmailAlreadySent: Boolean(payload['welcomeEmailAlreadySent'] ?? false),
        notionDashboardAlreadySynced: Boolean(payload['notionDashboardAlreadySynced'] ?? false),
        b2cUsersAlreadySynced: Boolean(payload['b2cUsersAlreadySynced'] ?? false),
      });
      assertB2CUsersLifecycleNotFailed(
        completedSignupResult.b2cUsersEntry,
        record.eventType,
        record.eventKey
      );
      return;
    }

    case 'billing.usage_started.organization': {
      const payload = record.payload as Record<string, unknown>;
      const b2cUsersResult = await recordB2CUsersOrganizationModeEntry({
        db: input.db,
        userId: String(payload['userId'] ?? ''),
        organizationId: String(payload['organizationId'] ?? ''),
        environment: (payload['environment'] as RuntimeEnvironment) ?? 'production',
      });
      assertB2CUsersLifecycleNotFailed(b2cUsersResult, record.eventType, record.eventKey);

      const usageDashboardResult = await recordUsageStartedNotionDashboardEntry({
        db: input.db,
        userId: String(payload['userId'] ?? ''),
        organizationId: String(payload['organizationId'] ?? ''),
        operationId: String(payload['operationId'] ?? ''),
        feature: String(payload['feature'] ?? ''),
        chargeAmountCents: Number(payload['chargeAmountCents'] ?? 0),
        environment: (payload['environment'] as RuntimeEnvironment) ?? 'production',
      });
      assertB2BNotionLifecycleCreated(usageDashboardResult, record.eventType, record.eventKey);
      return;
    }

    case 'billing.usage_started.individual': {
      const payload = record.payload as Record<string, unknown>;
      const b2cUsersResult = await recordB2CUsersUsageStartedEntry({
        db: input.db,
        userId: String(payload['userId'] ?? ''),
        operationId: String(payload['operationId'] ?? ''),
        feature: String(payload['feature'] ?? ''),
        chargeAmountCents: Number(payload['chargeAmountCents'] ?? 0),
        environment: (payload['environment'] as RuntimeEnvironment) ?? 'production',
      });
      assertB2CUsersLifecycleNotFailed(b2cUsersResult, record.eventType, record.eventKey);
      return;
    }

    case 'billing.trial_credits_finished': {
      const payload = record.payload as Record<string, unknown>;
      const billingOwnerType =
        payload['billingOwnerType'] === 'organization' ? 'organization' : 'individual';

      if (billingOwnerType === 'organization') {
        const result = await recordTrialCreditsFinishedNotionDashboardEntry({
          db: input.db,
          userId: String(payload['userId'] ?? ''),
          organizationId: compactText(payload['organizationId'] as string | null | undefined),
          operationId: String(payload['operationId'] ?? ''),
          feature: String(payload['feature'] ?? ''),
          baselineCents: Number(payload['baselineCents'] ?? 0),
          newBalanceCents: Number(payload['newBalanceCents'] ?? 0),
        });
        assertB2BNotionLifecycleCreated(result, record.eventType, record.eventKey);
        return;
      }

      const b2cUsersResult = await recordB2CUsersTrialCreditsFinishedEntry({
        db: input.db,
        userId: String(payload['userId'] ?? ''),
        operationId: String(payload['operationId'] ?? ''),
        feature: String(payload['feature'] ?? ''),
        baselineCents: Number(payload['baselineCents'] ?? 0),
        newBalanceCents: Number(payload['newBalanceCents'] ?? 0),
        environment: (payload['environment'] as RuntimeEnvironment) ?? 'production',
      });
      assertB2CUsersLifecycleNotFailed(b2cUsersResult, record.eventType, record.eventKey);
      return;
    }

    case 'billing.subscription.churned.organization': {
      const payload = record.payload as Record<string, unknown>;
      await recordChurnedNotionDashboardEntry({
        db: input.db,
        organizationId: String(payload['organizationId'] ?? ''),
        userId: String(payload['userId'] ?? ''),
        email: String(payload['email'] ?? ''),
        lastPaidAt: new Date(String(payload['lastPaidAt'] ?? '')),
        zeroBalanceSinceAt: new Date(String(payload['zeroBalanceSinceAt'] ?? '')),
        balanceCents: Number(payload['balanceCents'] ?? 0),
      });
      return;
    }

    case 'billing.purchase.closed_won.organization': {
      const payload = record.payload as Record<string, unknown>;
      const result = await recordClosedWonNotionDashboardEntry({
        db: input.db,
        organizationId: String(payload['organizationId'] ?? ''),
        amountCents: Number(payload['amountCents'] ?? 0),
        source: String(payload['source'] ?? 'stripe_checkout') as
          | 'stripe_checkout'
          | 'invoice_payment'
          | 'manual_credit'
          | 'direct_charge'
          | 'auto_topup',
        initiatedByUserId: compactText(payload['initiatedByUserId'] as string | null | undefined),
      });
      assertB2BNotionLifecycleCreated(result, record.eventType, record.eventKey);
      return;
    }

    case 'billing.purchase.expansion.organization': {
      const payload = record.payload as Record<string, unknown>;
      const result = await recordExpansionPricingNotionDashboardEntry({
        db: input.db,
        organizationId: String(payload['organizationId'] ?? ''),
        amountCents: Number(payload['amountCents'] ?? 0),
        source: String(payload['source'] ?? 'stripe_checkout') as
          | 'stripe_checkout'
          | 'invoice_payment'
          | 'manual_credit'
          | 'direct_charge'
          | 'auto_topup',
        initiatedByUserId: compactText(payload['initiatedByUserId'] as string | null | undefined),
      });
      assertB2BNotionLifecycleCreated(result, record.eventType, record.eventKey);
      return;
    }

    case 'billing.purchase.closed_won.individual': {
      const payload = record.payload as Record<string, unknown>;
      const b2cUsersResult = await recordB2CUsersClosedWonEntry({
        db: input.db,
        userId: String(payload['userId'] ?? ''),
        amountCents: Number(payload['amountCents'] ?? 0),
        source: String(payload['source'] ?? 'stripe_checkout') as 'stripe_checkout' | 'iap_topup',
        environment: (payload['environment'] as RuntimeEnvironment) ?? 'production',
      });
      assertB2CUsersLifecycleNotFailed(b2cUsersResult, record.eventType, record.eventKey);
      return;
    }

    case 'billing.purchase.expansion.individual': {
      const payload = record.payload as Record<string, unknown>;
      const b2cUsersResult = await recordB2CUsersExpansionPricingEntry({
        db: input.db,
        userId: String(payload['userId'] ?? ''),
        amountCents: Number(payload['amountCents'] ?? 0),
        source: String(payload['source'] ?? 'stripe_checkout') as 'stripe_checkout' | 'iap_topup',
        environment: (payload['environment'] as RuntimeEnvironment) ?? 'production',
      });
      assertB2CUsersLifecycleNotFailed(b2cUsersResult, record.eventType, record.eventKey);
      return;
    }
  }
}

export async function enqueueSignupCompletedMarketingOutboxEvent(
  input: EnqueueSignupCompletedMarketingOutboxInput
): Promise<EnqueueMarketingOutboxResult> {
  return enqueueMarketingOutboxEvent({
    db: input.db,
    eventKey: buildEventKey('signup.completed', [input.userId]),
    eventType: 'signup.completed',
    environment: input.environment,
    payload: {
      userId: input.userId,
      environment: input.environment,
      role: input.role,
      firstName: input.firstName,
      lastName: input.lastName,
      displayName: input.displayName,
      email: input.email,
      primarySport: input.primarySport,
      teamName: input.teamName,
      teamType: input.teamType,
      teamId: input.teamId,
      organizationId: input.organizationId,
      city: input.city,
      state: input.state,
      phone: input.phone,
      referralId: input.referralId,
      referralSource: input.referralSource,
      referralDetails: input.referralDetails,
      teamCode: input.teamCode,
      teamCodeName: input.teamCodeName,
      marketingEnabled: input.marketingEnabled,
      slackAlertAlreadySent: input.slackAlertAlreadySent,
      welcomeEmailAlreadySent: input.welcomeEmailAlreadySent,
      notionDashboardAlreadySynced: input.notionDashboardAlreadySynced,
      b2cUsersAlreadySynced: input.b2cUsersAlreadySynced,
    },
  });
}

export async function enqueueAccountStartedMarketingOutboxEvent(
  input: EnqueueAccountStartedMarketingOutboxInput
): Promise<EnqueueMarketingOutboxResult> {
  return enqueueMarketingOutboxEvent({
    db: input.db,
    eventKey: buildEventKey('signup.started', [input.userId]),
    eventType: 'signup.started',
    environment: input.environment,
    payload: {
      userId: input.userId,
      environment: input.environment,
    },
  });
}

export async function enqueueAgentDeliverableGeneratedMarketingOutboxEvent(
  input: EnqueueAgentDeliverableGeneratedMarketingOutboxInput
): Promise<EnqueueMarketingOutboxResult> {
  return enqueueMarketingOutboxEvent({
    db: input.db,
    eventKey: buildEventKey('agent.deliverable_generated', [input.operationId]),
    eventType: 'agent.deliverable_generated',
    environment: input.environment,
    payload: {
      operationId: input.operationId,
      userId: input.userId,
      threadId: input.threadId,
      agentId: input.agentId,
      title: input.title,
      summary: input.summary,
      environment: input.environment,
      deliverables: input.deliverables,
    },
  });
}

export async function enqueueUsageStartedMarketingOutboxEvent(
  input: EnqueueUsageStartedMarketingOutboxInput
): Promise<EnqueueMarketingOutboxResult> {
  const organizationId = compactText(input.organizationId);
  const eventType = organizationId
    ? 'billing.usage_started.organization'
    : 'billing.usage_started.individual';

  return enqueueMarketingOutboxEvent({
    db: input.db,
    eventKey: buildEventKey(eventType, [input.operationId]),
    eventType,
    environment: input.environment,
    payload: {
      userId: input.userId,
      organizationId: organizationId ?? null,
      operationId: input.operationId,
      feature: input.feature,
      chargeAmountCents: input.chargeAmountCents,
      environment: input.environment,
    },
  });
}

export async function enqueueTrialCreditsFinishedMarketingOutboxEvent(
  input: EnqueueTrialCreditsFinishedMarketingOutboxInput
): Promise<EnqueueMarketingOutboxResult> {
  return enqueueMarketingOutboxEvent({
    db: input.db,
    eventKey: buildEventKey('billing.trial_credits_finished', [input.operationId]),
    eventType: 'billing.trial_credits_finished',
    environment: input.environment,
    payload: {
      userId: input.userId,
      billingOwnerType: input.billingOwnerType,
      organizationId: compactText(input.organizationId) ?? null,
      operationId: input.operationId,
      feature: input.feature,
      baselineCents: input.baselineCents,
      newBalanceCents: input.newBalanceCents,
      environment: input.environment,
    },
  });
}

export async function enqueueOrgSubscriptionChurnedMarketingOutboxEvent(
  input: EnqueueOrgSubscriptionChurnedMarketingOutboxInput
): Promise<EnqueueMarketingOutboxResult> {
  const key = input.subscriptionId
    ? buildEventKey('billing.subscription.churned.organization', [input.subscriptionId])
    : buildEventKey('billing.subscription.churned.organization', [
        input.organizationId,
        input.userId,
        input.zeroBalanceSinceAt.toISOString(),
      ]);

  return enqueueMarketingOutboxEvent({
    db: input.db,
    eventKey: key,
    eventType: 'billing.subscription.churned.organization',
    environment: input.environment,
    payload: {
      organizationId: input.organizationId,
      userId: input.userId,
      email: compactText(input.email) ?? '',
      lastPaidAt: input.lastPaidAt.toISOString(),
      zeroBalanceSinceAt: input.zeroBalanceSinceAt.toISOString(),
      balanceCents: input.balanceCents,
      subscriptionId: input.subscriptionId,
      environment: input.environment,
    },
  });
}

export async function enqueueOrgPurchaseClosedWonMarketingOutboxEvent(
  input: EnqueueOrgPurchaseMarketingOutboxInput
): Promise<EnqueueMarketingOutboxResult> {
  const key = input.checkoutSessionId
    ? buildEventKey('billing.purchase.closed_won.organization', [input.checkoutSessionId])
    : input.invoiceId
      ? buildEventKey('billing.purchase.closed_won.organization', [input.invoiceId])
      : buildEventKey('billing.purchase.closed_won.organization', [
          input.organizationId,
          String(input.amountCents),
          input.source,
          compactText(input.initiatedByUserId) ?? '',
        ]);

  return enqueueMarketingOutboxEvent({
    db: input.db,
    eventKey: key,
    eventType: 'billing.purchase.closed_won.organization',
    environment: input.environment,
    payload: {
      organizationId: input.organizationId,
      amountCents: input.amountCents,
      source: input.source,
      initiatedByUserId: input.initiatedByUserId,
      checkoutSessionId: input.checkoutSessionId,
      invoiceId: input.invoiceId,
      environment: input.environment,
    },
  });
}

export async function enqueueOrgPurchaseExpansionMarketingOutboxEvent(
  input: EnqueueOrgPurchaseMarketingOutboxInput
): Promise<EnqueueMarketingOutboxResult> {
  const key = input.checkoutSessionId
    ? buildEventKey('billing.purchase.expansion.organization', [input.checkoutSessionId])
    : input.invoiceId
      ? buildEventKey('billing.purchase.expansion.organization', [input.invoiceId])
      : buildEventKey('billing.purchase.expansion.organization', [
          input.organizationId,
          String(input.amountCents),
          input.source,
          compactText(input.initiatedByUserId) ?? '',
        ]);

  return enqueueMarketingOutboxEvent({
    db: input.db,
    eventKey: key,
    eventType: 'billing.purchase.expansion.organization',
    environment: input.environment,
    payload: {
      organizationId: input.organizationId,
      amountCents: input.amountCents,
      source: input.source,
      initiatedByUserId: input.initiatedByUserId,
      checkoutSessionId: input.checkoutSessionId,
      invoiceId: input.invoiceId,
      environment: input.environment,
    },
  });
}

export async function enqueueIndividualPurchaseClosedWonMarketingOutboxEvent(
  input: EnqueueIndividualPurchaseMarketingOutboxInput
): Promise<EnqueueMarketingOutboxResult> {
  return enqueueMarketingOutboxEvent({
    db: input.db,
    eventKey: buildEventKey('billing.purchase.closed_won.individual', [
      input.userId,
      String(input.amountCents),
      input.source,
    ]),
    eventType: 'billing.purchase.closed_won.individual',
    environment: input.environment,
    payload: {
      userId: input.userId,
      amountCents: input.amountCents,
      source: input.source,
      environment: input.environment,
    },
  });
}

export async function enqueueIndividualPurchaseExpansionMarketingOutboxEvent(
  input: EnqueueIndividualPurchaseMarketingOutboxInput
): Promise<EnqueueMarketingOutboxResult> {
  return enqueueMarketingOutboxEvent({
    db: input.db,
    eventKey: buildEventKey('billing.purchase.expansion.individual', [
      input.userId,
      String(input.amountCents),
      input.source,
    ]),
    eventType: 'billing.purchase.expansion.individual',
    environment: input.environment,
    payload: {
      userId: input.userId,
      amountCents: input.amountCents,
      source: input.source,
      environment: input.environment,
    },
  });
}

export async function processPendingMarketingOutboxEvents(
  input: ProcessMarketingOutboxInput
): Promise<ProcessMarketingOutboxResult> {
  const limit = normalizeLimit(input.limit);
  const now = input.now ?? new Date();
  const snapshot = await input.db
    .collection(MARKETING_OUTBOX_COLLECTION)
    .where('status', 'in', ['pending', 'failed'])
    .limit(limit)
    .get();

  let processedCount = 0;
  let completedCount = 0;
  let failedCount = 0;
  let skippedCount = 0;

  for (const doc of snapshot.docs) {
    const claimed = await claimMarketingOutboxEvent({
      db: input.db,
      eventKey: doc.id,
      now,
    });

    if (!claimed) {
      skippedCount += 1;
      continue;
    }

    processedCount += 1;

    try {
      await processMarketingOutboxRecord({ db: input.db, record: claimed });
      await markMarketingOutboxCompleted({ db: input.db, eventKey: claimed.eventKey, now });
      completedCount += 1;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error('[MarketingOutbox] Failed to process event', {
        eventKey: claimed.eventKey,
        eventType: claimed.eventType,
        error: message,
      });
      await markMarketingOutboxFailed({
        db: input.db,
        eventKey: claimed.eventKey,
        now,
        error: message,
        attempts: claimed.attempts,
      });
      failedCount += 1;
    }
  }

  return {
    processedCount,
    completedCount,
    failedCount,
    skippedCount,
  };
}
