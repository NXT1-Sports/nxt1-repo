import {
  projectInvoicePaidDomainEventToMarketing,
  projectSignupCompletedDomainEventToMarketing,
  projectSubscriptionCanceledDomainEventToMarketing,
  projectTrialCreditsDepletedDomainEventToMarketing,
  projectUsageChargedDomainEventToMarketing,
  projectWalletFundedDomainEventToMarketing,
} from '../marketing/projectors/marketing-domain-event.projector.js';
import type {
  DomainEventType,
  PublishDomainEventResult,
  PublishInvoicePaidDomainEventInput,
  PublishSignupCompletedDomainEventInput,
  PublishSubscriptionCanceledDomainEventInput,
  PublishTrialCreditsDepletedDomainEventInput,
  PublishUsageChargedDomainEventInput,
  PublishWalletFundedDomainEventInput,
} from './domain-events.types.js';

function buildPublishResult(
  domainEventType: DomainEventType,
  projections: PublishDomainEventResult['projections']
): PublishDomainEventResult {
  return {
    domainEventType,
    projections,
  };
}

export async function publishSignupCompletedDomainEvent(
  input: PublishSignupCompletedDomainEventInput
): Promise<PublishDomainEventResult> {
  return buildPublishResult(
    'auth.user_onboarded',
    await projectSignupCompletedDomainEventToMarketing(input)
  );
}

export async function publishUsageChargedDomainEvent(
  input: PublishUsageChargedDomainEventInput
): Promise<PublishDomainEventResult> {
  return buildPublishResult(
    'billing.usage_charged',
    await projectUsageChargedDomainEventToMarketing(input)
  );
}

export async function publishTrialCreditsDepletedDomainEvent(
  input: PublishTrialCreditsDepletedDomainEventInput
): Promise<PublishDomainEventResult> {
  return buildPublishResult(
    'billing.trial_credits_depleted',
    await projectTrialCreditsDepletedDomainEventToMarketing(input)
  );
}

export async function publishWalletFundedDomainEvent(
  input: PublishWalletFundedDomainEventInput
): Promise<PublishDomainEventResult> {
  return buildPublishResult(
    'billing.wallet_funded',
    await projectWalletFundedDomainEventToMarketing(input)
  );
}

export async function publishInvoicePaidDomainEvent(
  input: PublishInvoicePaidDomainEventInput
): Promise<PublishDomainEventResult> {
  return buildPublishResult(
    'billing.invoice_paid',
    await projectInvoicePaidDomainEventToMarketing(input)
  );
}

export async function publishSubscriptionCanceledDomainEvent(
  input: PublishSubscriptionCanceledDomainEventInput
): Promise<PublishDomainEventResult> {
  return buildPublishResult(
    'billing.subscription_canceled',
    await projectSubscriptionCanceledDomainEventToMarketing(input)
  );
}

export type {
  DomainEventProjectionResult,
  DomainEventType,
  PublishDomainEventResult,
  PublishInvoicePaidDomainEventInput,
  PublishSignupCompletedDomainEventInput,
  PublishSubscriptionCanceledDomainEventInput,
  PublishTrialCreditsDepletedDomainEventInput,
  PublishUsageChargedDomainEventInput,
  PublishWalletFundedDomainEventInput,
} from './domain-events.types.js';
