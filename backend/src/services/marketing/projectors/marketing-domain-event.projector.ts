import {
  enqueueAgentDeliverableGeneratedMarketingOutboxEvent,
  enqueueIndividualPurchaseClosedWonMarketingOutboxEvent,
  enqueueIndividualPurchaseExpansionMarketingOutboxEvent,
  enqueueOrgPurchaseClosedWonMarketingOutboxEvent,
  enqueueOrgPurchaseExpansionMarketingOutboxEvent,
  enqueueOrgSubscriptionChurnedMarketingOutboxEvent,
  enqueueSignupCompletedMarketingOutboxEvent,
  enqueueTrialCreditsFinishedMarketingOutboxEvent,
  enqueueUsageStartedMarketingOutboxEvent,
} from '../outbox/marketing-outbox.service.js';
import type {
  PublishAgentDeliverableGeneratedDomainEventInput,
  DomainEventProjectionResult,
  PublishInvoicePaidDomainEventInput,
  PublishSignupCompletedDomainEventInput,
  PublishSubscriptionCanceledDomainEventInput,
  PublishTrialCreditsDepletedDomainEventInput,
  PublishUsageChargedDomainEventInput,
  PublishWalletFundedDomainEventInput,
} from '../../domain-events/domain-events.types.js';

function toMarketingProjection(result: {
  readonly eventKey: string;
  readonly eventType: string;
  readonly deduplicated: boolean;
}): DomainEventProjectionResult {
  return {
    projector: 'marketing',
    eventKey: result.eventKey,
    eventType: result.eventType,
    deduplicated: result.deduplicated,
  };
}

export async function projectAgentDeliverableGeneratedDomainEventToMarketing(
  input: PublishAgentDeliverableGeneratedDomainEventInput
): Promise<readonly DomainEventProjectionResult[]> {
  const result = await enqueueAgentDeliverableGeneratedMarketingOutboxEvent(input);
  return [toMarketingProjection(result)];
}

export async function projectSignupCompletedDomainEventToMarketing(
  input: PublishSignupCompletedDomainEventInput
): Promise<readonly DomainEventProjectionResult[]> {
  const result = await enqueueSignupCompletedMarketingOutboxEvent(input);
  return [toMarketingProjection(result)];
}

export async function projectUsageChargedDomainEventToMarketing(
  input: PublishUsageChargedDomainEventInput
): Promise<readonly DomainEventProjectionResult[]> {
  const result = await enqueueUsageStartedMarketingOutboxEvent(input);
  return [toMarketingProjection(result)];
}

export async function projectTrialCreditsDepletedDomainEventToMarketing(
  input: PublishTrialCreditsDepletedDomainEventInput
): Promise<readonly DomainEventProjectionResult[]> {
  const result = await enqueueTrialCreditsFinishedMarketingOutboxEvent(input);
  return [toMarketingProjection(result)];
}

export async function projectWalletFundedDomainEventToMarketing(
  input: PublishWalletFundedDomainEventInput
): Promise<readonly DomainEventProjectionResult[]> {
  if (input.billingOwnerType === 'organization') {
    if (input.source === 'manual_credit') {
      return [];
    }

    const closedWon = await enqueueOrgPurchaseClosedWonMarketingOutboxEvent({
      db: input.db,
      environment: input.environment,
      organizationId: input.organizationId,
      amountCents: input.amountCents,
      source: input.source,
      initiatedByUserId: input.initiatedByUserId,
      checkoutSessionId: input.checkoutSessionId,
      invoiceId: input.invoiceId,
    });

    if (input.source === 'auto_topup') {
      return [toMarketingProjection(closedWon)];
    }

    const expansion = await enqueueOrgPurchaseExpansionMarketingOutboxEvent({
      db: input.db,
      environment: input.environment,
      organizationId: input.organizationId,
      amountCents: input.amountCents,
      source: input.source,
      initiatedByUserId: input.initiatedByUserId,
      checkoutSessionId: input.checkoutSessionId,
      invoiceId: input.invoiceId,
    });

    return [toMarketingProjection(closedWon), toMarketingProjection(expansion)];
  }

  const closedWon = await enqueueIndividualPurchaseClosedWonMarketingOutboxEvent({
    db: input.db,
    environment: input.environment,
    userId: input.userId,
    amountCents: input.amountCents,
    source: input.source,
  });
  const expansion = await enqueueIndividualPurchaseExpansionMarketingOutboxEvent({
    db: input.db,
    environment: input.environment,
    userId: input.userId,
    amountCents: input.amountCents,
    source: input.source,
  });

  return [toMarketingProjection(closedWon), toMarketingProjection(expansion)];
}

export async function projectInvoicePaidDomainEventToMarketing(
  input: PublishInvoicePaidDomainEventInput
): Promise<readonly DomainEventProjectionResult[]> {
  const result = await enqueueOrgPurchaseClosedWonMarketingOutboxEvent({
    db: input.db,
    environment: input.environment,
    organizationId: input.organizationId,
    amountCents: input.amountCents,
    source: 'invoice_payment',
    initiatedByUserId: input.initiatedByUserId,
    invoiceId: input.invoiceId,
  });

  return [toMarketingProjection(result)];
}

export async function projectSubscriptionCanceledDomainEventToMarketing(
  input: PublishSubscriptionCanceledDomainEventInput
): Promise<readonly DomainEventProjectionResult[]> {
  const result = await enqueueOrgSubscriptionChurnedMarketingOutboxEvent(input);
  return [toMarketingProjection(result)];
}
