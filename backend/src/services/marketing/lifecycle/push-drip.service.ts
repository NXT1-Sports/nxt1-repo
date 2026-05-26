import { FieldValue } from 'firebase-admin/firestore';
import {
  DEFAULT_NOTIFICATION_CADENCE_CAPS,
  NOTIFICATION_TYPES,
  type PortableTimestamp,
  type UserRole,
} from '@nxt1/core';
import type { NotificationCadenceCaps, NotificationQuietHours } from '@nxt1/core';
import type { RuntimeEnvironment } from '../../../config/runtime-environment.js';
import { PaymentLogModel } from '../../../models/billing/payment-log.model.js';
import { dispatch } from '../../communications/notification.service.js';
import { resolveBillingTarget } from '../../../modules/billing/budget.service.js';
import type { UserV2Document } from '../../../routes/auth/shared.js';
import { logger } from '../../../utils/logger.js';
import { buildRoleBasedOnboardingPushVariant } from '../push/campaigns/onboarding/role-based-onboarding-push.service.js';

export const PUSH_DRIP_CAMPAIGN_KEY = 'push_onboarding_role_activation_v1';
export const PUSH_DRIP_WELCOME_STEP_KEY = 'welcome_nudge';
export const PUSH_DRIP_ACTIVATION_STEP_KEY = 'activation_nudge';
export const PUSH_DRIP_REENGAGEMENT_STEP_KEY = 'reengagement_nudge';
export const PUSH_DRIP_STEP_SEQUENCE = [
  PUSH_DRIP_WELCOME_STEP_KEY,
  PUSH_DRIP_ACTIVATION_STEP_KEY,
  PUSH_DRIP_REENGAGEMENT_STEP_KEY,
] as const;

const PUSH_DRIP_DAY_OFFSETS: Record<PushDripStepKey, number> = {
  [PUSH_DRIP_WELCOME_STEP_KEY]: 1,
  [PUSH_DRIP_ACTIVATION_STEP_KEY]: 3,
  [PUSH_DRIP_REENGAGEMENT_STEP_KEY]: 7,
};

const DEFAULT_QUERY_LIMIT = 100;
const POSTS_COLLECTION = 'Posts';

export type PushDripStepKey = (typeof PUSH_DRIP_STEP_SEQUENCE)[number];
export type PushDripRoleTrack = 'athlete' | 'coach' | 'director';
export type PushDripPaymentState = 'unknown' | 'unpaid' | 'paid' | 'org-covered';
export type PushDripSuppressionReason =
  | 'completed'
  | 'push-disabled'
  | 'marketing-disabled'
  | 'quiet-hours'
  | 'cadence-cap'
  | 'target-achieved'
  | 'paid-converted';

export interface PushDripHistoryEntry {
  readonly stepKey: PushDripStepKey;
  readonly sentAt: Date;
  readonly roleTrack: PushDripRoleTrack;
  readonly paymentState: PushDripPaymentState;
  readonly campaignKey: string;
}

export interface PushDripStateRecord {
  readonly campaignKey: typeof PUSH_DRIP_CAMPAIGN_KEY;
  readonly enrolledAt: Date;
  readonly roleTrack: PushDripRoleTrack;
  readonly paymentState: PushDripPaymentState;
  readonly currentStepKey: PushDripStepKey;
  readonly lastSentStepKey?: PushDripStepKey;
  readonly lastSentAt?: Date;
  readonly nextEligibleAt: Date;
  readonly completedAt?: Date;
  readonly pausedAt?: Date;
  readonly suppressionReason?: PushDripSuppressionReason;
  readonly history?: PushDripHistoryEntry[];
}

export interface PushDeliveryStats {
  readonly dayKey?: string;
  readonly dailyCount?: number;
  readonly marketingDayKey?: string;
  readonly marketingDailyCount?: number;
  readonly lastSentAt?: Date;
  readonly lastMarketingSentAt?: Date;
}

interface PushDripUserSnapshot {
  readonly id: string;
  readonly firstName?: string;
  readonly role: UserRole;
  readonly primarySport?: string;
  readonly organizationName?: string;
  readonly pushEnabled?: boolean;
  readonly marketingPushEnabled?: boolean;
  readonly quietHours?: NotificationQuietHours;
  readonly cadenceCaps?: NotificationCadenceCaps;
  readonly deliveryStats?: PushDeliveryStats;
  readonly agentXLastActiveAt?: Date | null;
  readonly hasProfileImage: boolean;
  readonly hasBio: boolean;
  readonly hasConnectedSources: boolean;
  readonly hasClassYear: boolean;
  readonly hasPositions: boolean;
  readonly hasTeamContext: boolean;
  readonly state: PushDripStateRecord;
}

interface PushDripActivationSignals {
  readonly hasMeaningfulProfile: boolean;
  readonly hasAgentXActivity: boolean;
  readonly hasTeamContext: boolean;
  readonly roleTargetAchieved: boolean;
}

type PushDripDecision =
  | { readonly action: 'pause'; readonly reason: 'push-disabled' | 'marketing-disabled' }
  | { readonly action: 'advance'; readonly reason: 'target-achieved' }
  | {
      readonly action: 'defer';
      readonly reason: 'quiet-hours' | 'cadence-cap';
      readonly nextEligibleAt: Date;
    }
  | { readonly action: 'complete'; readonly reason: 'completed' | 'target-achieved' }
  | { readonly action: 'send' };

interface EnrollPushDripInput {
  readonly db: FirebaseFirestore.Firestore;
  readonly userId: string;
  readonly role: UserRole;
  readonly now?: Date;
}

export interface EnrollPushDripResult {
  readonly status: 'enrolled' | 'skipped';
  readonly reason?: 'already-enrolled';
  readonly state?: PushDripStateRecord;
}

export interface PushDripProcessingResult {
  readonly userId: string;
  readonly outcome: 'sent' | 'advanced' | 'paused' | 'completed' | 'skipped' | 'failed';
  readonly stepKey?: PushDripStepKey;
  readonly reason?: string;
  readonly campaignKey?: string;
}

export interface RunPushDripCampaignResult {
  readonly processedCount: number;
  readonly sentCount: number;
  readonly advancedCount: number;
  readonly pausedCount: number;
  readonly completedCount: number;
  readonly failedCount: number;
  readonly skippedCount: number;
  readonly results: PushDripProcessingResult[];
}

interface RunPushDripCampaignInput {
  readonly db: FirebaseFirestore.Firestore;
  readonly environment: RuntimeEnvironment;
  readonly now?: Date;
  readonly limit?: number;
}

function addDays(baseDate: Date, days: number): Date {
  return new Date(baseDate.getTime() + days * 24 * 60 * 60 * 1000);
}

function addMinutes(baseDate: Date, minutes: number): Date {
  return new Date(baseDate.getTime() + minutes * 60 * 1000);
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
      seconds?: number;
      _seconds?: number;
      toMillis?: () => number;
    };

    if (typeof candidate.toDate === 'function') {
      return candidate.toDate();
    }
    if (typeof candidate.toMillis === 'function') {
      return new Date(candidate.toMillis());
    }

    const epochSeconds =
      typeof candidate.seconds === 'number'
        ? candidate.seconds
        : typeof candidate._seconds === 'number'
          ? candidate._seconds
          : null;
    if (epochSeconds !== null) {
      return new Date(epochSeconds * 1000);
    }
  }

  return null;
}

function readBoolean(value: unknown): boolean | undefined {
  return typeof value === 'boolean' ? value : undefined;
}

function readString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
}

function getPushDripRoleTrack(role: UserRole): PushDripRoleTrack {
  if (role === 'athlete') return 'athlete';
  if (role === 'director') return 'director';
  return 'coach';
}

function getStepEligibleAt(enrolledAt: Date, stepKey: PushDripStepKey): Date {
  return addDays(enrolledAt, PUSH_DRIP_DAY_OFFSETS[stepKey]);
}

function getNextStepKey(stepKey: PushDripStepKey): PushDripStepKey | null {
  const currentIndex = PUSH_DRIP_STEP_SEQUENCE.indexOf(stepKey);
  if (currentIndex === -1 || currentIndex >= PUSH_DRIP_STEP_SEQUENCE.length - 1) {
    return null;
  }

  return PUSH_DRIP_STEP_SEQUENCE[currentIndex + 1];
}

function resolveNotificationPreferences(user: UserV2Document): Record<string, unknown> {
  const preferences = user.preferences;
  if (!preferences || typeof preferences !== 'object') {
    return {};
  }

  const notifications = (preferences as Record<string, unknown>)['notifications'];
  return notifications && typeof notifications === 'object'
    ? (notifications as Record<string, unknown>)
    : {};
}

function resolvePushEnabled(user: UserV2Document): boolean | undefined {
  return readBoolean(resolveNotificationPreferences(user)['push']);
}

function resolveMarketingPushEnabled(user: UserV2Document): boolean | undefined {
  const notifications = resolveNotificationPreferences(user);
  const categoryPreferences = notifications['categoryPreferences'];
  const marketingCategory =
    categoryPreferences && typeof categoryPreferences === 'object'
      ? (categoryPreferences as Record<string, unknown>)['marketing']
      : undefined;
  const categoryPush =
    marketingCategory && typeof marketingCategory === 'object'
      ? readBoolean((marketingCategory as Record<string, unknown>)['push'])
      : undefined;

  if (categoryPush === false) return false;
  return readBoolean(notifications['marketing']);
}

function resolveQuietHours(user: UserV2Document): NotificationQuietHours | undefined {
  const quietHours = resolveNotificationPreferences(user)['quietHours'];
  if (!quietHours || typeof quietHours !== 'object') {
    return undefined;
  }

  const raw = quietHours as Record<string, unknown>;
  if (
    typeof raw['enabled'] !== 'boolean' ||
    typeof raw['startHour'] !== 'number' ||
    typeof raw['endHour'] !== 'number' ||
    typeof raw['timezone'] !== 'string'
  ) {
    return undefined;
  }

  return {
    enabled: raw['enabled'],
    startHour: raw['startHour'],
    endHour: raw['endHour'],
    timezone: raw['timezone'],
  };
}

function resolveCadenceCaps(user: UserV2Document): NotificationCadenceCaps | undefined {
  const cadenceCaps = resolveNotificationPreferences(user)['cadenceCaps'];
  if (!cadenceCaps || typeof cadenceCaps !== 'object') {
    return { ...DEFAULT_NOTIFICATION_CADENCE_CAPS };
  }

  const raw = cadenceCaps as Record<string, unknown>;
  return {
    ...DEFAULT_NOTIFICATION_CADENCE_CAPS,
    ...(typeof raw['maxPushesPerDay'] === 'number'
      ? { maxPushesPerDay: raw['maxPushesPerDay'] }
      : {}),
    ...(typeof raw['minIntervalMinutes'] === 'number'
      ? { minIntervalMinutes: raw['minIntervalMinutes'] }
      : {}),
    ...(typeof raw['maxMarketingPushesPerDay'] === 'number'
      ? { maxMarketingPushesPerDay: raw['maxMarketingPushesPerDay'] }
      : {}),
  };
}

function resolveDeliveryStats(user: UserV2Document): PushDeliveryStats | undefined {
  const rawStats = user.lifecycle?.push?.delivery;
  if (!rawStats) {
    return undefined;
  }

  return {
    dayKey: readString(rawStats.dayKey),
    dailyCount: typeof rawStats.dailyCount === 'number' ? rawStats.dailyCount : undefined,
    marketingDayKey: readString(rawStats.marketingDayKey),
    marketingDailyCount:
      typeof rawStats.marketingDailyCount === 'number' ? rawStats.marketingDailyCount : undefined,
    lastSentAt: toDate(rawStats.lastSentAt) ?? undefined,
    lastMarketingSentAt: toDate(rawStats.lastMarketingSentAt) ?? undefined,
  };
}

function parsePushDripState(rawValue: unknown, role: UserRole): PushDripStateRecord | null {
  if (!rawValue || typeof rawValue !== 'object') {
    return null;
  }

  const raw = rawValue as Record<string, unknown>;
  const enrolledAt = toDate(raw['enrolledAt']);
  const nextEligibleAt = toDate(raw['nextEligibleAt']);
  const currentStepKey = raw['currentStepKey'];

  if (!enrolledAt || !nextEligibleAt || typeof currentStepKey !== 'string') {
    return null;
  }

  if (!PUSH_DRIP_STEP_SEQUENCE.includes(currentStepKey as PushDripStepKey)) {
    return null;
  }

  const history = Array.isArray(raw['history'])
    ? raw['history']
        .map((entry) => {
          if (!entry || typeof entry !== 'object') {
            return null;
          }

          const typedEntry = entry as Record<string, unknown>;
          const sentAt = toDate(typedEntry['sentAt']);
          const stepKey = typedEntry['stepKey'];
          const roleTrack = typedEntry['roleTrack'];
          const paymentState = typedEntry['paymentState'];
          const campaignKey = typedEntry['campaignKey'];

          if (
            !sentAt ||
            typeof stepKey !== 'string' ||
            !PUSH_DRIP_STEP_SEQUENCE.includes(stepKey as PushDripStepKey) ||
            !['athlete', 'coach', 'director'].includes(String(roleTrack)) ||
            !['unknown', 'unpaid', 'paid', 'org-covered'].includes(String(paymentState)) ||
            typeof campaignKey !== 'string'
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
        .filter((entry): entry is PushDripHistoryEntry => entry !== null)
    : [];

  return {
    campaignKey: PUSH_DRIP_CAMPAIGN_KEY,
    enrolledAt,
    roleTrack: ['athlete', 'coach', 'director'].includes(String(raw['roleTrack']))
      ? (raw['roleTrack'] as PushDripRoleTrack)
      : getPushDripRoleTrack(role),
    paymentState: ['unknown', 'unpaid', 'paid', 'org-covered'].includes(String(raw['paymentState']))
      ? (raw['paymentState'] as PushDripPaymentState)
      : 'unknown',
    currentStepKey: currentStepKey as PushDripStepKey,
    lastSentStepKey: PUSH_DRIP_STEP_SEQUENCE.includes(raw['lastSentStepKey'] as PushDripStepKey)
      ? (raw['lastSentStepKey'] as PushDripStepKey)
      : undefined,
    lastSentAt: toDate(raw['lastSentAt']) ?? undefined,
    nextEligibleAt,
    completedAt: toDate(raw['completedAt']) ?? undefined,
    pausedAt: toDate(raw['pausedAt']) ?? undefined,
    suppressionReason:
      typeof raw['suppressionReason'] === 'string'
        ? (raw['suppressionReason'] as PushDripSuppressionReason)
        : undefined,
    history,
  };
}

export function buildInitialPushDripState(
  role: UserRole,
  now: Date = new Date()
): PushDripStateRecord {
  return {
    campaignKey: PUSH_DRIP_CAMPAIGN_KEY,
    enrolledAt: now,
    roleTrack: getPushDripRoleTrack(role),
    paymentState: 'unknown',
    currentStepKey: PUSH_DRIP_WELCOME_STEP_KEY,
    nextEligibleAt: getStepEligibleAt(now, PUSH_DRIP_WELCOME_STEP_KEY),
    history: [],
  };
}

async function writePushDripState(
  db: FirebaseFirestore.Firestore,
  userId: string,
  state: PushDripStateRecord
): Promise<void> {
  await db
    .collection('Users')
    .doc(userId)
    .update({
      'lifecycle.push.drip.campaignKey': state.campaignKey,
      'lifecycle.push.drip.enrolledAt': state.enrolledAt,
      'lifecycle.push.drip.roleTrack': state.roleTrack,
      'lifecycle.push.drip.paymentState': state.paymentState,
      'lifecycle.push.drip.currentStepKey': state.currentStepKey,
      'lifecycle.push.drip.lastSentStepKey': state.lastSentStepKey ?? FieldValue.delete(),
      'lifecycle.push.drip.lastSentAt': state.lastSentAt ?? FieldValue.delete(),
      'lifecycle.push.drip.nextEligibleAt': state.nextEligibleAt,
      'lifecycle.push.drip.completedAt': state.completedAt ?? FieldValue.delete(),
      'lifecycle.push.drip.pausedAt': state.pausedAt ?? FieldValue.delete(),
      'lifecycle.push.drip.suppressionReason': state.suppressionReason ?? FieldValue.delete(),
      'lifecycle.push.drip.history': state.history ?? [],
    });
}

export async function enrollPushDrip(input: EnrollPushDripInput): Promise<EnrollPushDripResult> {
  const userRef = input.db.collection('Users').doc(input.userId);
  const userSnap = await userRef.get();
  const existingDrip = userSnap.get('lifecycle.push.drip') as PushDripStateRecord | undefined;

  if (existingDrip?.enrolledAt || existingDrip?.completedAt) {
    return { status: 'skipped', reason: 'already-enrolled' };
  }

  const state = buildInitialPushDripState(input.role, input.now);
  await writePushDripState(input.db, input.userId, state);

  return { status: 'enrolled', state };
}

async function hasTimelinePost(db: FirebaseFirestore.Firestore, userId: string): Promise<boolean> {
  const snapshot = await db
    .collection(POSTS_COLLECTION)
    .where('userId', '==', userId)
    .orderBy('createdAt', 'desc')
    .limit(1)
    .get();

  return !snapshot.empty;
}

async function resolvePaymentState(
  db: FirebaseFirestore.Firestore,
  userId: string
): Promise<PushDripPaymentState> {
  try {
    const billingTarget = await resolveBillingTarget(db, userId);

    if (billingTarget.type === 'organization' && billingTarget.organizationId) {
      const organizationPaid = await PaymentLogModel.exists({
        organizationId: billingTarget.organizationId,
        status: 'PAID',
      });
      return organizationPaid ? 'org-covered' : 'unpaid';
    }

    const userPaid = await PaymentLogModel.exists({
      userId: billingTarget.billingUserId,
      status: 'PAID',
    });
    return userPaid ? 'paid' : 'unpaid';
  } catch (error) {
    logger.warn('[PushDrip] Failed to resolve payment state', {
      userId,
      error: error instanceof Error ? error.message : String(error),
    });
    return 'unknown';
  }
}

function isQuietHours(
  quietHours: NotificationQuietHours | undefined,
  now: Date = new Date()
): boolean {
  if (!quietHours?.enabled) return false;

  try {
    const formatter = new Intl.DateTimeFormat('en-US', {
      hour: 'numeric',
      hour12: false,
      timeZone: quietHours.timezone,
    });
    const userHour = parseInt(formatter.format(now), 10);

    if (quietHours.startHour < quietHours.endHour) {
      return userHour >= quietHours.startHour && userHour < quietHours.endHour;
    }

    return userHour >= quietHours.startHour || userHour < quietHours.endHour;
  } catch {
    return false;
  }
}

function exceedsCadenceCap(
  cadenceCaps: NotificationCadenceCaps | undefined,
  deliveryStats: PushDeliveryStats | undefined,
  now: Date
): boolean {
  if (!deliveryStats) {
    return false;
  }

  const effectiveCadenceCaps = cadenceCaps ?? DEFAULT_NOTIFICATION_CADENCE_CAPS;

  if (
    effectiveCadenceCaps.minIntervalMinutes &&
    deliveryStats.lastMarketingSentAt &&
    now.getTime() - deliveryStats.lastMarketingSentAt.getTime() <
      effectiveCadenceCaps.minIntervalMinutes * 60 * 1000
  ) {
    return true;
  }

  const dayKey = now.toISOString().slice(0, 10);
  if (
    effectiveCadenceCaps.maxMarketingPushesPerDay &&
    deliveryStats.marketingDayKey === dayKey &&
    (deliveryStats.marketingDailyCount ?? 0) >= effectiveCadenceCaps.maxMarketingPushesPerDay
  ) {
    return true;
  }

  if (
    effectiveCadenceCaps.maxPushesPerDay &&
    deliveryStats.dayKey === dayKey &&
    (deliveryStats.dailyCount ?? 0) >= effectiveCadenceCaps.maxPushesPerDay
  ) {
    return true;
  }

  return false;
}

async function buildUserSnapshot(
  doc: FirebaseFirestore.QueryDocumentSnapshot
): Promise<PushDripUserSnapshot | null> {
  const user = doc.data() as UserV2Document;
  const role = user.role;
  if (!role) {
    return null;
  }

  const state = parsePushDripState(doc.get('lifecycle.push.drip'), role);
  if (!state || state.completedAt) {
    return null;
  }

  const timelineRelevantTeamContext = Boolean(
    user.coach?.organization?.trim() ||
    user.teamCode?.teamId ||
    user.teamCode?.teamName ||
    user.organization?.trim()
  );

  return {
    id: doc.id,
    firstName: user.firstName,
    role,
    primarySport: Array.isArray(user.sports)
      ? user.sports[typeof user.activeSportIndex === 'number' ? user.activeSportIndex : 0]?.sport
      : undefined,
    organizationName:
      user.coach?.organization?.trim() ||
      user.teamCode?.teamName?.trim() ||
      user.organization?.trim(),
    pushEnabled: resolvePushEnabled(user),
    marketingPushEnabled: resolveMarketingPushEnabled(user),
    quietHours: resolveQuietHours(user),
    cadenceCaps: resolveCadenceCaps(user),
    deliveryStats: resolveDeliveryStats(user),
    agentXLastActiveAt: toDate(doc.get('agentXLastActiveAt') as PortableTimestamp | undefined),
    hasProfileImage: Array.isArray(user.profileImgs) && user.profileImgs.length > 0,
    hasBio: typeof user.aboutMe === 'string' && user.aboutMe.trim().length > 0,
    hasConnectedSources: Array.isArray(user.connectedSources) && user.connectedSources.length > 0,
    hasClassYear: typeof user.classOf === 'number',
    hasPositions: Array.isArray(user.sports)
      ? user.sports.some((sport) => Array.isArray(sport.positions) && sport.positions.length > 0)
      : false,
    hasTeamContext: timelineRelevantTeamContext,
    state,
  };
}

async function buildActivationSignals(
  db: FirebaseFirestore.Firestore,
  user: PushDripUserSnapshot
): Promise<PushDripActivationSignals> {
  const timelinePost = await hasTimelinePost(db, user.id);
  const hasMeaningfulProfile =
    [
      user.hasProfileImage,
      user.hasBio,
      user.hasConnectedSources,
      user.hasClassYear,
      user.hasPositions,
    ].filter(Boolean).length >= 2 || timelinePost;
  const hasAgentXActivity = Boolean(user.agentXLastActiveAt);
  const roleTargetAchieved =
    user.state.roleTrack === 'athlete'
      ? hasMeaningfulProfile && hasAgentXActivity
      : user.hasTeamContext && hasAgentXActivity;

  return {
    hasMeaningfulProfile,
    hasAgentXActivity,
    hasTeamContext: user.hasTeamContext,
    roleTargetAchieved,
  };
}

export function evaluatePushDripDecision(input: {
  readonly stepKey: PushDripStepKey;
  readonly pushEnabled?: boolean;
  readonly marketingPushEnabled?: boolean;
  readonly signals: PushDripActivationSignals;
  readonly inQuietHours: boolean;
  readonly exceedsCadenceCap: boolean;
  readonly now: Date;
  readonly retryDelayMinutes?: number;
}): PushDripDecision {
  if (input.pushEnabled === false) {
    return { action: 'pause', reason: 'push-disabled' };
  }

  if (input.marketingPushEnabled === false) {
    return { action: 'pause', reason: 'marketing-disabled' };
  }

  if (input.inQuietHours) {
    return {
      action: 'defer',
      reason: 'quiet-hours',
      nextEligibleAt: addMinutes(input.now, input.retryDelayMinutes ?? 60),
    };
  }

  if (input.exceedsCadenceCap) {
    return {
      action: 'defer',
      reason: 'cadence-cap',
      nextEligibleAt: addMinutes(input.now, input.retryDelayMinutes ?? 180),
    };
  }

  if (input.stepKey === PUSH_DRIP_REENGAGEMENT_STEP_KEY && input.signals.roleTargetAchieved) {
    return { action: 'complete', reason: 'target-achieved' };
  }

  if (
    (input.stepKey === PUSH_DRIP_WELCOME_STEP_KEY ||
      input.stepKey === PUSH_DRIP_ACTIVATION_STEP_KEY) &&
    input.signals.roleTargetAchieved
  ) {
    return { action: 'advance', reason: 'target-achieved' };
  }

  return { action: 'send' };
}

function buildCompletedState(
  state: PushDripStateRecord,
  now: Date,
  paymentState: PushDripPaymentState,
  reason: 'completed' | 'target-achieved'
): PushDripStateRecord {
  return {
    ...state,
    paymentState,
    completedAt: now,
    nextEligibleAt: now,
    pausedAt: undefined,
    suppressionReason: reason,
  };
}

function buildAdvancedState(
  state: PushDripStateRecord,
  now: Date,
  paymentState: PushDripPaymentState
): PushDripStateRecord {
  const nextStepKey = getNextStepKey(state.currentStepKey);
  if (!nextStepKey) {
    return buildCompletedState(state, now, paymentState, 'completed');
  }

  return {
    ...state,
    paymentState,
    currentStepKey: nextStepKey,
    nextEligibleAt: getStepEligibleAt(state.enrolledAt, nextStepKey),
    pausedAt: undefined,
    suppressionReason: 'target-achieved',
  };
}

function buildPausedState(
  state: PushDripStateRecord,
  now: Date,
  paymentState: PushDripPaymentState,
  reason: 'push-disabled' | 'marketing-disabled'
): PushDripStateRecord {
  return {
    ...state,
    paymentState,
    pausedAt: now,
    suppressionReason: reason,
    nextEligibleAt: addDays(now, 1),
  };
}

function buildDeferredState(
  state: PushDripStateRecord,
  paymentState: PushDripPaymentState,
  reason: 'quiet-hours' | 'cadence-cap',
  nextEligibleAt: Date
): PushDripStateRecord {
  return {
    ...state,
    paymentState,
    pausedAt: undefined,
    suppressionReason: reason,
    nextEligibleAt,
  };
}

function buildSentState(input: {
  readonly state: PushDripStateRecord;
  readonly now: Date;
  readonly paymentState: PushDripPaymentState;
  readonly campaignKey: string;
}): PushDripStateRecord {
  const nextStepKey = getNextStepKey(input.state.currentStepKey);
  const historyEntry: PushDripHistoryEntry = {
    stepKey: input.state.currentStepKey,
    sentAt: input.now,
    roleTrack: input.state.roleTrack,
    paymentState: input.paymentState,
    campaignKey: input.campaignKey,
  };

  if (!nextStepKey) {
    return {
      ...input.state,
      paymentState: input.paymentState,
      lastSentStepKey: input.state.currentStepKey,
      lastSentAt: input.now,
      completedAt: input.now,
      nextEligibleAt: input.now,
      pausedAt: undefined,
      suppressionReason: 'completed',
      history: [...(input.state.history ?? []), historyEntry],
    };
  }

  return {
    ...input.state,
    paymentState: input.paymentState,
    currentStepKey: nextStepKey,
    lastSentStepKey: input.state.currentStepKey,
    lastSentAt: input.now,
    nextEligibleAt: getStepEligibleAt(input.state.enrolledAt, nextStepKey),
    pausedAt: undefined,
    suppressionReason: undefined,
    history: [...(input.state.history ?? []), historyEntry],
  };
}

async function processPushDripUser(input: {
  readonly db: FirebaseFirestore.Firestore;
  readonly environment: RuntimeEnvironment;
  readonly user: PushDripUserSnapshot;
  readonly now: Date;
}): Promise<PushDripProcessingResult> {
  const paymentState = await resolvePaymentState(input.db, input.user.id);
  const signals = await buildActivationSignals(input.db, input.user);
  const decision = evaluatePushDripDecision({
    stepKey: input.user.state.currentStepKey,
    pushEnabled: input.user.pushEnabled,
    marketingPushEnabled: input.user.marketingPushEnabled,
    signals,
    inQuietHours: isQuietHours(input.user.quietHours, input.now),
    exceedsCadenceCap: exceedsCadenceCap(
      input.user.cadenceCaps,
      input.user.deliveryStats,
      input.now
    ),
    now: input.now,
    retryDelayMinutes: input.user.cadenceCaps?.minIntervalMinutes,
  });

  if (decision.action === 'pause') {
    await writePushDripState(
      input.db,
      input.user.id,
      buildPausedState(input.user.state, input.now, paymentState, decision.reason)
    );
    return {
      userId: input.user.id,
      outcome: 'paused',
      stepKey: input.user.state.currentStepKey,
      reason: decision.reason,
    };
  }

  if (decision.action === 'defer') {
    await writePushDripState(
      input.db,
      input.user.id,
      buildDeferredState(input.user.state, paymentState, decision.reason, decision.nextEligibleAt)
    );
    return {
      userId: input.user.id,
      outcome: 'skipped',
      stepKey: input.user.state.currentStepKey,
      reason: decision.reason,
    };
  }

  if (decision.action === 'advance') {
    await writePushDripState(
      input.db,
      input.user.id,
      buildAdvancedState(input.user.state, input.now, paymentState)
    );
    return {
      userId: input.user.id,
      outcome: 'advanced',
      stepKey: input.user.state.currentStepKey,
      reason: decision.reason,
    };
  }

  if (decision.action === 'complete') {
    await writePushDripState(
      input.db,
      input.user.id,
      buildCompletedState(input.user.state, input.now, paymentState, decision.reason)
    );
    return {
      userId: input.user.id,
      outcome: 'completed',
      stepKey: input.user.state.currentStepKey,
      reason: decision.reason,
    };
  }

  const variant = buildRoleBasedOnboardingPushVariant({
    role: input.user.role,
    stepKey: input.user.state.currentStepKey,
    paymentState,
    primarySport: input.user.primarySport,
    organizationName: input.user.organizationName,
  });

  try {
    await dispatch(input.db, {
      userId: input.user.id,
      type: NOTIFICATION_TYPES.MARKETING_CAMPAIGN,
      title: variant.title,
      body: variant.body,
      deepLink: variant.deepLink,
      data: {
        campaignKey: variant.campaignKey,
        stepKey: input.user.state.currentStepKey,
        roleTrack: input.user.state.roleTrack,
      },
      campaign: {
        key: variant.campaignKey,
        segment: `role:${input.user.state.roleTrack}`,
      },
      deliveryPolicy: {
        respectQuietHours: true,
        respectCadenceCap: true,
        treatAsMarketing: true,
      },
      idempotencyKey: `push_drip_${variant.campaignKey}_${input.user.id}_${input.user.state.currentStepKey}`,
    });
  } catch (error) {
    logger.error('[PushDrip] Push dispatch failed', {
      userId: input.user.id,
      stepKey: input.user.state.currentStepKey,
      error: error instanceof Error ? error.message : String(error),
    });
    return {
      userId: input.user.id,
      outcome: 'failed',
      stepKey: input.user.state.currentStepKey,
      reason: 'push-dispatch-failed',
    };
  }

  await writePushDripState(
    input.db,
    input.user.id,
    buildSentState({
      state: input.user.state,
      now: input.now,
      paymentState,
      campaignKey: variant.campaignKey,
    })
  );

  return {
    userId: input.user.id,
    outcome: 'sent',
    stepKey: input.user.state.currentStepKey,
    campaignKey: variant.campaignKey,
  };
}

export async function runPushDripCampaign(
  input: RunPushDripCampaignInput
): Promise<RunPushDripCampaignResult> {
  const now = input.now ?? new Date();
  const limit = input.limit ?? DEFAULT_QUERY_LIMIT;
  const snapshot = await input.db
    .collection('Users')
    .where('lifecycle.push.drip.nextEligibleAt', '<=', now)
    .orderBy('lifecycle.push.drip.nextEligibleAt', 'asc')
    .limit(limit)
    .get();

  const results: PushDripProcessingResult[] = [];

  for (const doc of snapshot.docs) {
    try {
      const user = await buildUserSnapshot(doc);
      if (!user) {
        results.push({ userId: doc.id, outcome: 'skipped', reason: 'no-active-drip-state' });
        continue;
      }

      results.push(
        await processPushDripUser({
          db: input.db,
          environment: input.environment,
          user,
          now,
        })
      );
    } catch (error) {
      logger.error('[PushDrip] Failed processing user', {
        userId: doc.id,
        error: error instanceof Error ? error.message : String(error),
      });
      results.push({
        userId: doc.id,
        outcome: 'failed',
        reason: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return {
    processedCount: results.length,
    sentCount: results.filter((result) => result.outcome === 'sent').length,
    advancedCount: results.filter((result) => result.outcome === 'advanced').length,
    pausedCount: results.filter((result) => result.outcome === 'paused').length,
    completedCount: results.filter((result) => result.outcome === 'completed').length,
    failedCount: results.filter((result) => result.outcome === 'failed').length,
    skippedCount: results.filter((result) => result.outcome === 'skipped').length,
    results,
  };
}
