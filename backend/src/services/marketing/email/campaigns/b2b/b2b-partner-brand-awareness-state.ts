import {
  B2B_PARTNER_BRAND_AWARENESS_RECIPIENTS,
  type B2BPartnerBrandAwarenessRecipient,
  type B2BPartnerOutreachSequenceStep,
  type B2BPartnerOutreachStatus,
} from './b2b-partner-brand-awareness-recipients.js';

const FOLLOW_UP_DELAY_DAYS = 5;

export interface B2BPartnerCampaignHistoryEntry {
  readonly sequenceStep: B2BPartnerOutreachSequenceStep;
  readonly sentAt: string;
  readonly campaignKey: string;
  readonly subject: string;
  readonly provider: 'platform_smtp' | 'brevo';
  readonly providerMessageId?: string;
}

export interface B2BPartnerCampaignStateEntry extends B2BPartnerBrandAwarenessRecipient {
  readonly history: readonly B2BPartnerCampaignHistoryEntry[];
}

export interface B2BPartnerCampaignState {
  readonly version: 1;
  readonly campaignKey: 'b2b_partner_program_invite';
  readonly updatedAt: string;
  readonly recipients: readonly B2BPartnerCampaignStateEntry[];
}

export interface B2BPartnerCampaignSummary {
  readonly total: number;
  readonly notSent: number;
  readonly sent: number;
  readonly followUpDue: number;
  readonly followUpSent: number;
  readonly replied: number;
  readonly paused: number;
  readonly initialQueue: number;
  readonly followUpQueue: number;
  readonly finalFollowUpQueue: number;
  readonly byPartnerType: Readonly<Record<string, number>>;
}

function addDays(date: Date, days: number): string {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next.toISOString();
}

function getMaterializedStatus(
  recipient: Pick<B2BPartnerCampaignStateEntry, 'deliveryStatus' | 'nextFollowUpAt'>,
  now: Date
): B2BPartnerOutreachStatus {
  if (
    recipient.deliveryStatus === 'sent' &&
    recipient.nextFollowUpAt &&
    new Date(recipient.nextFollowUpAt).getTime() <= now.getTime()
  ) {
    return 'follow_up_due';
  }

  return recipient.deliveryStatus;
}

export function createB2BPartnerCampaignState(
  recipients: readonly B2BPartnerBrandAwarenessRecipient[] = B2B_PARTNER_BRAND_AWARENESS_RECIPIENTS,
  now: Date = new Date()
): B2BPartnerCampaignState {
  return {
    version: 1,
    campaignKey: 'b2b_partner_program_invite',
    updatedAt: now.toISOString(),
    recipients: recipients.map((recipient) => ({
      ...recipient,
      email: recipient.email.trim().toLowerCase(),
      history: [],
    })),
  };
}

export function mergeB2BPartnerCampaignState(
  existingState: B2BPartnerCampaignState | null,
  recipients: readonly B2BPartnerBrandAwarenessRecipient[] = B2B_PARTNER_BRAND_AWARENESS_RECIPIENTS,
  now: Date = new Date()
): B2BPartnerCampaignState {
  if (!existingState) {
    return createB2BPartnerCampaignState(recipients, now);
  }

  const existingByEmail = new Map(
    existingState.recipients.map((recipient) => [recipient.email.trim().toLowerCase(), recipient])
  );

  return {
    version: 1,
    campaignKey: 'b2b_partner_program_invite',
    updatedAt: now.toISOString(),
    recipients: recipients.map((recipient) => {
      const normalizedEmail = recipient.email.trim().toLowerCase();
      const existing = existingByEmail.get(normalizedEmail);

      if (!existing) {
        return {
          ...recipient,
          email: normalizedEmail,
          history: [],
        } satisfies B2BPartnerCampaignStateEntry;
      }

      return {
        ...recipient,
        email: normalizedEmail,
        sendCount: existing.sendCount,
        sequenceStep: existing.sequenceStep,
        deliveryStatus: getMaterializedStatus(existing, now),
        lastSentAt: existing.lastSentAt,
        nextFollowUpAt: existing.nextFollowUpAt,
        notes: existing.notes || recipient.notes,
        history: existing.history,
      } satisfies B2BPartnerCampaignStateEntry;
    }),
  };
}

export function summarizeB2BPartnerCampaignState(
  state: B2BPartnerCampaignState,
  now: Date = new Date()
): B2BPartnerCampaignSummary {
  const byPartnerType: Record<string, number> = {};
  let notSent = 0;
  let sent = 0;
  let followUpDue = 0;
  let followUpSent = 0;
  let replied = 0;
  let paused = 0;
  let initialQueue = 0;
  let followUpQueue = 0;
  let finalFollowUpQueue = 0;

  for (const recipient of state.recipients) {
    const status = getMaterializedStatus(recipient, now);

    byPartnerType[recipient.partnerType] = (byPartnerType[recipient.partnerType] ?? 0) + 1;

    if (status === 'not_sent') notSent += 1;
    if (status === 'sent') sent += 1;
    if (status === 'follow_up_due') followUpDue += 1;
    if (status === 'follow_up_sent') followUpSent += 1;
    if (status === 'replied') replied += 1;
    if (status === 'paused') paused += 1;

    if (recipient.sequenceStep === 'initial' && status === 'not_sent') {
      initialQueue += 1;
    }

    if (
      recipient.sequenceStep === 'follow_up' &&
      (status === 'sent' || status === 'follow_up_due')
    ) {
      followUpQueue += 1;
    }

    if (
      recipient.sequenceStep === 'final_follow_up' &&
      (status === 'sent' || status === 'follow_up_due')
    ) {
      finalFollowUpQueue += 1;
    }
  }

  return {
    total: state.recipients.length,
    notSent,
    sent,
    followUpDue,
    followUpSent,
    replied,
    paused,
    initialQueue,
    followUpQueue,
    finalFollowUpQueue,
    byPartnerType,
  };
}

export function selectB2BPartnerCampaignRecipients(
  state: B2BPartnerCampaignState,
  sequenceStep: B2BPartnerOutreachSequenceStep,
  now: Date = new Date()
): readonly B2BPartnerCampaignStateEntry[] {
  return state.recipients.filter((recipient) => {
    const status = getMaterializedStatus(recipient, now);

    if (sequenceStep === 'initial') {
      return status === 'not_sent';
    }

    if (sequenceStep === 'follow_up') {
      return (
        recipient.sequenceStep === 'follow_up' && (status === 'sent' || status === 'follow_up_due')
      );
    }

    return (
      recipient.sequenceStep === 'final_follow_up' &&
      (status === 'sent' || status === 'follow_up_due')
    );
  });
}

export function markB2BPartnerCampaignSent(
  recipient: B2BPartnerCampaignStateEntry,
  event: B2BPartnerCampaignHistoryEntry,
  now: Date = new Date()
): B2BPartnerCampaignStateEntry {
  const isInitial = event.sequenceStep === 'initial';
  const nextStep = isInitial ? 'follow_up' : 'final_follow_up';

  return {
    ...recipient,
    sendCount: recipient.sendCount + 1,
    sequenceStep: nextStep,
    deliveryStatus: isInitial ? 'sent' : 'follow_up_sent',
    lastSentAt: event.sentAt,
    nextFollowUpAt: isInitial ? addDays(now, FOLLOW_UP_DELAY_DAYS) : null,
    history: [...recipient.history, event],
  };
}
