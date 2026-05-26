import type { UserRole } from '@nxt1/core';
import { logger } from '../../../utils/logger.js';
import type { UserV2Document } from '../../../routes/auth/shared.js';
import {
  PUSH_DRIP_CAMPAIGN_KEY,
  PUSH_DRIP_STEP_SEQUENCE,
  type PushDripHistoryEntry,
  type PushDripPaymentState,
  type PushDripRoleTrack,
  type PushDripStateRecord,
  type PushDripStepKey,
  type PushDripSuppressionReason,
} from './push-drip.service.js';

type PushDripStepBreakdown = Record<PushDripStepKey, number>;
type PushDripRoleBreakdown = Record<PushDripRoleTrack, number>;
type PushDripPaymentBreakdown = Record<PushDripPaymentState, number>;
type PushDripSuppressionBreakdown = Partial<Record<PushDripSuppressionReason, number>>;

export interface PushDripReport {
  readonly campaignKey: string;
  readonly generatedAt: Date;
  readonly lookbackDays: number;
  readonly totals: {
    readonly enrolledCount: number;
    readonly activeCount: number;
    readonly pausedCount: number;
    readonly completedCount: number;
    readonly dueNowCount: number;
    readonly sentCount: number;
    readonly sentInWindowCount: number;
  };
  readonly currentStepBreakdown: PushDripStepBreakdown;
  readonly roleTrackBreakdown: PushDripRoleBreakdown;
  readonly paymentStateBreakdown: PushDripPaymentBreakdown;
  readonly suppressionReasonBreakdown: PushDripSuppressionBreakdown;
  readonly recentSendBreakdown: {
    readonly byStep: PushDripStepBreakdown;
    readonly byRoleTrack: PushDripRoleBreakdown;
  };
}

interface GetPushDripReportInput {
  readonly db: FirebaseFirestore.Firestore;
  readonly now?: Date;
  readonly lookbackDays?: number;
}

function createStepBreakdown(): PushDripStepBreakdown {
  return {
    welcome_nudge: 0,
    activation_nudge: 0,
    reengagement_nudge: 0,
  };
}

function createRoleBreakdown(): PushDripRoleBreakdown {
  return {
    athlete: 0,
    coach: 0,
    director: 0,
  };
}

function createPaymentBreakdown(): PushDripPaymentBreakdown {
  return {
    unknown: 0,
    unpaid: 0,
    paid: 0,
    'org-covered': 0,
  };
}

function increment<T extends string>(record: Partial<Record<T, number>>, key: T): void {
  record[key] = (record[key] ?? 0) + 1;
}

function toDate(value: unknown): Date | null {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (typeof value === 'string') {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  if (typeof value === 'object') {
    const candidate = value as {
      toDate?: () => Date;
      toMillis?: () => number;
      seconds?: number;
      _seconds?: number;
    };
    if (typeof candidate.toDate === 'function') return candidate.toDate();
    if (typeof candidate.toMillis === 'function') return new Date(candidate.toMillis());
    const seconds =
      typeof candidate.seconds === 'number'
        ? candidate.seconds
        : typeof candidate._seconds === 'number'
          ? candidate._seconds
          : null;
    if (seconds !== null) return new Date(seconds * 1000);
  }
  return null;
}

function getRoleTrack(role: UserRole | undefined): PushDripRoleTrack {
  if (role === 'athlete') return 'athlete';
  if (role === 'director') return 'director';
  return 'coach';
}

function parseHistory(rawValue: unknown): PushDripHistoryEntry[] {
  if (!Array.isArray(rawValue)) {
    return [];
  }

  return rawValue
    .map((entry) => {
      if (!entry || typeof entry !== 'object') {
        return null;
      }

      const raw = entry as Record<string, unknown>;
      const sentAt = toDate(raw['sentAt']);
      const stepKey = raw['stepKey'];
      const roleTrack = raw['roleTrack'];
      const paymentState = raw['paymentState'];
      const campaignKey = raw['campaignKey'];

      if (
        !sentAt ||
        typeof campaignKey !== 'string' ||
        !PUSH_DRIP_STEP_SEQUENCE.includes(stepKey as PushDripStepKey) ||
        !['athlete', 'coach', 'director'].includes(String(roleTrack)) ||
        !['unknown', 'unpaid', 'paid', 'org-covered'].includes(String(paymentState))
      ) {
        return null;
      }

      return {
        stepKey: stepKey as PushDripStepKey,
        sentAt,
        roleTrack: roleTrack as PushDripRoleTrack,
        paymentState: paymentState as PushDripPaymentState,
        campaignKey,
      };
    })
    .filter((entry): entry is PushDripHistoryEntry => entry !== null);
}

function parsePushDripState(user: UserV2Document): PushDripStateRecord | null {
  const rawValue = user.lifecycle?.push?.drip;
  if (!rawValue || typeof rawValue !== 'object') {
    return null;
  }

  const enrolledAt = toDate(rawValue.enrolledAt);
  const nextEligibleAt = toDate(rawValue.nextEligibleAt);
  const currentStepKey = rawValue.currentStepKey;

  if (
    !enrolledAt ||
    !nextEligibleAt ||
    !PUSH_DRIP_STEP_SEQUENCE.includes(currentStepKey as PushDripStepKey)
  ) {
    return null;
  }

  const roleTrack = ['athlete', 'coach', 'director'].includes(String(rawValue.roleTrack))
    ? (rawValue.roleTrack as PushDripRoleTrack)
    : getRoleTrack(user.role);
  const paymentState = ['unknown', 'unpaid', 'paid', 'org-covered'].includes(
    String(rawValue.paymentState)
  )
    ? (rawValue.paymentState as PushDripPaymentState)
    : 'unknown';

  return {
    campaignKey: PUSH_DRIP_CAMPAIGN_KEY,
    enrolledAt,
    roleTrack,
    paymentState,
    currentStepKey: currentStepKey as PushDripStepKey,
    lastSentStepKey: PUSH_DRIP_STEP_SEQUENCE.includes(rawValue.lastSentStepKey as PushDripStepKey)
      ? (rawValue.lastSentStepKey as PushDripStepKey)
      : undefined,
    lastSentAt: toDate(rawValue.lastSentAt) ?? undefined,
    nextEligibleAt,
    completedAt: toDate(rawValue.completedAt) ?? undefined,
    pausedAt: toDate(rawValue.pausedAt) ?? undefined,
    suppressionReason:
      typeof rawValue.suppressionReason === 'string'
        ? (rawValue.suppressionReason as PushDripSuppressionReason)
        : undefined,
    history: parseHistory(rawValue.history),
  };
}

export function summarizePushDripStates(
  states: readonly PushDripStateRecord[],
  now: Date = new Date(),
  lookbackDays = 7
): PushDripReport {
  const cutoff = new Date(now.getTime() - lookbackDays * 24 * 60 * 60 * 1000);
  const currentStepBreakdown = createStepBreakdown();
  const roleTrackBreakdown = createRoleBreakdown();
  const paymentStateBreakdown = createPaymentBreakdown();
  const suppressionReasonBreakdown: PushDripSuppressionBreakdown = {};
  const recentSendByStep = createStepBreakdown();
  const recentSendByRoleTrack = createRoleBreakdown();

  let activeCount = 0;
  let pausedCount = 0;
  let completedCount = 0;
  let dueNowCount = 0;
  let sentCount = 0;
  let sentInWindowCount = 0;

  for (const state of states) {
    increment(currentStepBreakdown, state.currentStepKey);
    increment(roleTrackBreakdown, state.roleTrack);
    increment(paymentStateBreakdown, state.paymentState);

    if (state.completedAt) {
      completedCount += 1;
    } else {
      activeCount += 1;
      if (state.nextEligibleAt <= now) {
        dueNowCount += 1;
      }
      if (state.pausedAt) {
        pausedCount += 1;
      }
    }

    if (state.suppressionReason) {
      increment(suppressionReasonBreakdown, state.suppressionReason);
    }

    for (const entry of state.history ?? []) {
      sentCount += 1;
      if (entry.sentAt >= cutoff) {
        sentInWindowCount += 1;
        increment(recentSendByStep, entry.stepKey);
        increment(recentSendByRoleTrack, entry.roleTrack);
      }
    }
  }

  return {
    campaignKey: PUSH_DRIP_CAMPAIGN_KEY,
    generatedAt: now,
    lookbackDays,
    totals: {
      enrolledCount: states.length,
      activeCount,
      pausedCount,
      completedCount,
      dueNowCount,
      sentCount,
      sentInWindowCount,
    },
    currentStepBreakdown,
    roleTrackBreakdown,
    paymentStateBreakdown,
    suppressionReasonBreakdown,
    recentSendBreakdown: {
      byStep: recentSendByStep,
      byRoleTrack: recentSendByRoleTrack,
    },
  };
}

export async function getPushDripReport(input: GetPushDripReportInput): Promise<PushDripReport> {
  const now = input.now ?? new Date();
  const lookbackDays = Math.max(1, Math.min(input.lookbackDays ?? 7, 30));
  const snapshot = await input.db
    .collection('Users')
    .where('lifecycle.push.drip.campaignKey', '==', PUSH_DRIP_CAMPAIGN_KEY)
    .get();

  const states: PushDripStateRecord[] = [];

  for (const doc of snapshot.docs) {
    const user = doc.data() as UserV2Document;
    const state = parsePushDripState(user);
    if (!state) {
      logger.warn('[PushDripReport] Skipping malformed push-drip state', { userId: doc.id });
      continue;
    }
    states.push(state);
  }

  return summarizePushDripStates(states, now, lookbackDays);
}
