import type { Firestore } from 'firebase-admin/firestore';
import type { AgentIdentifier, UserRole } from '@nxt1/core';
import type { RuntimeEnvironment } from '../../config/runtime-environment.js';

export type DomainEventType =
  | 'agent.deliverable_generated'
  | 'auth.user_created'
  | 'auth.user_onboarded'
  | 'billing.invoice_paid'
  | 'billing.subscription_canceled'
  | 'billing.trial_credits_depleted'
  | 'billing.usage_charged'
  | 'billing.wallet_funded';

export interface DomainEventProjectionResult {
  readonly projector: 'marketing';
  readonly eventKey: string;
  readonly eventType: string;
  readonly deduplicated: boolean;
}

export interface PublishDomainEventResult {
  readonly domainEventType: DomainEventType;
  readonly projections: readonly DomainEventProjectionResult[];
}

export interface PublishAccountStartedDomainEventInput {
  readonly db: Firestore;
  readonly environment: RuntimeEnvironment;
  readonly userId: string;
}

export interface PublishSignupCompletedDomainEventInput {
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

export interface AgentDeliverableGeneratedDomainEventItem {
  readonly url: string;
  readonly name: string;
  readonly type: 'image' | 'video';
  readonly mimeType?: string;
  readonly thumbnailUrl?: string;
  readonly storagePath?: string;
}

export interface PublishAgentDeliverableGeneratedDomainEventInput {
  readonly db: Firestore;
  readonly environment: RuntimeEnvironment;
  readonly operationId: string;
  readonly userId: string;
  readonly threadId?: string;
  readonly agentId?: AgentIdentifier;
  readonly title?: string;
  readonly summary?: string;
  readonly deliverables: readonly AgentDeliverableGeneratedDomainEventItem[];
}

export interface PublishUsageChargedDomainEventInput {
  readonly db: Firestore;
  readonly environment: RuntimeEnvironment;
  readonly userId: string;
  readonly operationId: string;
  readonly feature: string;
  readonly chargeAmountCents: number;
  readonly organizationId?: string;
}

export interface PublishTrialCreditsDepletedDomainEventInput {
  readonly db: Firestore;
  readonly environment: RuntimeEnvironment;
  readonly userId: string;
  readonly organizationId: string;
  readonly operationId: string;
  readonly feature: string;
  readonly baselineCents: number;
  readonly newBalanceCents: number;
}

export type OrganizationWalletFundingSource =
  | 'stripe_checkout'
  | 'invoice_payment'
  | 'manual_credit'
  | 'direct_charge'
  | 'auto_topup';

export type IndividualWalletFundingSource = 'stripe_checkout' | 'iap_topup';

export type PublishWalletFundedDomainEventInput =
  | {
      readonly db: Firestore;
      readonly environment: RuntimeEnvironment;
      readonly billingOwnerType: 'organization';
      readonly organizationId: string;
      readonly amountCents: number;
      readonly source: OrganizationWalletFundingSource;
      readonly initiatedByUserId?: string;
      readonly checkoutSessionId?: string;
      readonly invoiceId?: string;
    }
  | {
      readonly db: Firestore;
      readonly environment: RuntimeEnvironment;
      readonly billingOwnerType: 'individual';
      readonly userId: string;
      readonly amountCents: number;
      readonly source: IndividualWalletFundingSource;
    };

export interface PublishInvoicePaidDomainEventInput {
  readonly db: Firestore;
  readonly environment: RuntimeEnvironment;
  readonly organizationId: string;
  readonly amountCents: number;
  readonly initiatedByUserId?: string;
  readonly invoiceId?: string;
}

export interface PublishSubscriptionCanceledDomainEventInput {
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
