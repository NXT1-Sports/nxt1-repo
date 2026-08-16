import { createHash } from 'node:crypto';
import {
  getRuntimeEnvironment,
  type RuntimeEnvironment,
} from '../../../config/runtime-environment.js';
import {
  MarketingEmailDispatchModel,
  type MarketingEmailDispatchDocument,
  type MarketingEmailDispatchProvider,
} from '../../../models/marketing/marketing-email-dispatch.model.js';

const NULL_USER_ATTEMPTED_SUPERSEDED_REASON =
  'Superseded stale attempted dispatch for a recipient-scoped marketing send.';

export interface CreateMarketingEmailDispatchInput {
  readonly dispatchId: string;
  readonly trackingId: string;
  readonly campaignKey: string;
  readonly campaignFamily: string;
  readonly provider: MarketingEmailDispatchProvider;
  readonly userId?: string;
  readonly to: string;
  readonly subject: string;
  readonly replyTo?: string;
  readonly metadata?: Record<string, unknown>;
}

export interface MarkMarketingEmailDispatchSentInput {
  readonly dispatchId: string;
  readonly providerMessageId?: string;
  readonly sentAt?: Date;
}

export interface MarkMarketingEmailDispatchFailedInput {
  readonly dispatchId: string;
  readonly failureReason: string;
  readonly failedAt?: Date;
}

export interface MarkMarketingEmailDispatchBouncedInput {
  readonly dispatchId: string;
  readonly failureReason: string;
  readonly bouncedAt?: Date;
}

export function hashMarketingRecipientEmail(email: string): string {
  return createHash('sha256').update(email.trim().toLowerCase()).digest('hex');
}

export function readMarketingRecipientDomain(email: string): string | null {
  const normalized = email.trim().toLowerCase();
  const atIndex = normalized.lastIndexOf('@');
  if (atIndex <= 0 || atIndex === normalized.length - 1) {
    return null;
  }

  return normalized.slice(atIndex + 1);
}

export async function createMarketingEmailDispatch(
  input: CreateMarketingEmailDispatchInput
): Promise<void> {
  const document: MarketingEmailDispatchDocument = {
    environment: getRuntimeEnvironment(),
    dispatchId: input.dispatchId,
    trackingId: input.trackingId,
    campaignKey: input.campaignKey,
    campaignFamily: input.campaignFamily,
    provider: input.provider,
    userId: input.userId ?? null,
    recipientEmailHash: hashMarketingRecipientEmail(input.to),
    recipientDomain: readMarketingRecipientDomain(input.to),
    subject: input.subject,
    replyTo: input.replyTo ?? null,
    sendStatus: 'attempted',
    metadata: input.metadata ?? {},
    lastEventAt: new Date(),
  };

  try {
    await MarketingEmailDispatchModel.create(document);
    return;
  } catch (error) {
    if (!shouldRecycleAnonymousAttemptedDispatch(error, input, document.environment)) {
      throw error;
    }

    const supersededAt = new Date();
    await MarketingEmailDispatchModel.updateMany(
      {
        environment: document.environment,
        campaignKey: input.campaignKey,
        userId: null,
        sendStatus: 'attempted',
      },
      {
        $set: {
          sendStatus: 'failed',
          failureReason: NULL_USER_ATTEMPTED_SUPERSEDED_REASON,
          failedAt: supersededAt,
          lastEventAt: supersededAt,
        },
      }
    );

    await MarketingEmailDispatchModel.create(document);
  }
}

function shouldRecycleAnonymousAttemptedDispatch(
  error: unknown,
  input: CreateMarketingEmailDispatchInput,
  environment: RuntimeEnvironment
): boolean {
  if (input.userId) return false;
  if (!isDuplicateKeyError(error)) return false;

  const message = error.message.toLowerCase();
  return (
    message.includes('marketingemaildispatches') &&
    message.includes('campaignkey') &&
    message.includes('userid') &&
    message.includes(environment.toLowerCase())
  );
}

function isDuplicateKeyError(error: unknown): error is Error & { readonly code: number } {
  return error instanceof Error && 'code' in error && (error as { code?: unknown }).code === 11000;
}

export async function hasSentMarketingEmailCampaign(input: {
  readonly campaignKey: string;
  readonly userId: string;
}): Promise<boolean> {
  const existing = await MarketingEmailDispatchModel.exists({
    environment: getRuntimeEnvironment(),
    campaignKey: input.campaignKey,
    userId: input.userId,
    sendStatus: { $in: ['sent', 'delivered'] },
  });

  return Boolean(existing);
}

export async function markMarketingEmailDispatchSent(
  input: MarkMarketingEmailDispatchSentInput
): Promise<void> {
  const sentAt = input.sentAt ?? new Date();

  await MarketingEmailDispatchModel.updateOne(
    { dispatchId: input.dispatchId },
    {
      $set: {
        sendStatus: 'sent',
        providerMessageId: input.providerMessageId ?? null,
        sentAt,
        lastEventAt: sentAt,
      },
      $unset: {
        failureReason: 1,
        failedAt: 1,
      },
    }
  );
}

export async function markMarketingEmailDispatchFailed(
  input: MarkMarketingEmailDispatchFailedInput
): Promise<void> {
  const failedAt = input.failedAt ?? new Date();

  await MarketingEmailDispatchModel.updateOne(
    { dispatchId: input.dispatchId },
    {
      $set: {
        sendStatus: 'failed',
        failureReason: input.failureReason,
        failedAt,
        lastEventAt: failedAt,
      },
    }
  );
}

export async function markMarketingEmailDispatchBounced(
  input: MarkMarketingEmailDispatchBouncedInput
): Promise<void> {
  const bouncedAt = input.bouncedAt ?? new Date();

  await MarketingEmailDispatchModel.updateOne(
    { dispatchId: input.dispatchId },
    {
      $set: {
        sendStatus: 'bounced',
        failureReason: input.failureReason,
        bouncedAt,
        lastEventAt: bouncedAt,
      },
      $unset: {
        failedAt: 1,
      },
    }
  );
}
