/**
 * @fileoverview Signup Drip Lifecycle Service
 * @module @nxt1/backend/services/marketing/lifecycle/signup-drip
 *
 * Owns durable signup drip state plus the daily evaluation logic that sends,
 * advances, pauses, or completes the campaign from backend-only signals.
 */

import { FieldValue } from 'firebase-admin/firestore';
import { isTeamRole } from '@nxt1/core';
import type { PortableTimestamp, UserRole } from '@nxt1/core';
import type { RuntimeEnvironment } from '../../../config/runtime-environment.js';
import { PaymentLogModel } from '../../../models/billing/payment-log.model.js';
import { resolveBillingTarget } from '../../../modules/billing/budget.service.js';
import type { UserV2Document } from '../../../routes/auth/shared.js';
import { logger } from '../../../utils/logger.js';
import {
  sendSignupDripEmail,
  type SignupDripEmailResult,
} from '../email/campaigns/signup/signup-drip-email.service.js';
import { recordB2BPartnerContactEvent } from '../integrations/notion/signup-dashboard-entry.service.js';

export const SIGNUP_DRIP_CAMPAIGN_KEY = 'signup_elite_v1';
export const SIGNUP_DRIP_PROFILE_SETUP_STEP_KEY = 'profile_setup';
export const SIGNUP_DRIP_AGENT_ACTIVATION_STEP_KEY = 'agent_activation';
export const SIGNUP_DRIP_DAY3_INACTIVITY_STEP_KEY = 'day3_inactivity_nudge';
export const SIGNUP_DRIP_DAY7_MID_TRIAL_STEP_KEY = 'day7_mid_trial_showcase';
export const SIGNUP_DRIP_DAY14_FEEDBACK_NO_USAGE_STEP_KEY = 'day14_pretrial_feedback_no_usage';
export const SIGNUP_DRIP_DAY14_FEEDBACK_HAS_USAGE_STEP_KEY = 'day14_pretrial_feedback_has_usage';
export const SIGNUP_DRIP_DAY14_POST_PURCHASE_STEP_KEY = 'day14_post_purchase_checkin';
export const SIGNUP_DRIP_DAY30_POST_PURCHASE_STEP_KEY = 'day30_post_purchase_survey';
export const SIGNUP_DRIP_REENGAGEMENT_STEP_KEY = 'reengagement';

export const SIGNUP_DRIP_STEP_SEQUENCE = [
  SIGNUP_DRIP_PROFILE_SETUP_STEP_KEY,
  SIGNUP_DRIP_AGENT_ACTIVATION_STEP_KEY,
  SIGNUP_DRIP_DAY3_INACTIVITY_STEP_KEY,
  SIGNUP_DRIP_DAY7_MID_TRIAL_STEP_KEY,
  SIGNUP_DRIP_DAY14_FEEDBACK_NO_USAGE_STEP_KEY,
  SIGNUP_DRIP_DAY14_FEEDBACK_HAS_USAGE_STEP_KEY,
  SIGNUP_DRIP_DAY14_POST_PURCHASE_STEP_KEY,
  SIGNUP_DRIP_DAY30_POST_PURCHASE_STEP_KEY,
  SIGNUP_DRIP_REENGAGEMENT_STEP_KEY,
] as const;

const SIGNUP_DRIP_STEP_LABELS: Record<SignupDripStepKey, string> = {
  [SIGNUP_DRIP_PROFILE_SETUP_STEP_KEY]: 'Day 0 - Profile Setup',
  [SIGNUP_DRIP_AGENT_ACTIVATION_STEP_KEY]: 'Day 1 - Agent X Activation',
  [SIGNUP_DRIP_DAY3_INACTIVITY_STEP_KEY]: 'Day 3 - Inactivity Nudge',
  [SIGNUP_DRIP_DAY7_MID_TRIAL_STEP_KEY]: 'Day 7 - Mid-Trial Showcase',
  [SIGNUP_DRIP_DAY14_FEEDBACK_NO_USAGE_STEP_KEY]: 'Day 14 - Pre-Trial Survey (No Usage)',
  [SIGNUP_DRIP_DAY14_FEEDBACK_HAS_USAGE_STEP_KEY]: 'Day 14 - Pre-Trial Survey (Unfinished Trial)',
  [SIGNUP_DRIP_DAY14_POST_PURCHASE_STEP_KEY]: 'Day 14 - Post-Purchase Check-in',
  [SIGNUP_DRIP_DAY30_POST_PURCHASE_STEP_KEY]: 'Day 30 - Post-Purchase Survey',
  [SIGNUP_DRIP_REENGAGEMENT_STEP_KEY]: 'Day 30 - Reengagement',
};

const SIGNUP_DRIP_DAY_OFFSETS: Record<SignupDripStepKey, number> = {
  [SIGNUP_DRIP_PROFILE_SETUP_STEP_KEY]: 3,
  [SIGNUP_DRIP_AGENT_ACTIVATION_STEP_KEY]: 3,
  [SIGNUP_DRIP_DAY3_INACTIVITY_STEP_KEY]: 3,
  [SIGNUP_DRIP_DAY7_MID_TRIAL_STEP_KEY]: 7,
  [SIGNUP_DRIP_DAY14_FEEDBACK_NO_USAGE_STEP_KEY]: 14,
  [SIGNUP_DRIP_DAY14_FEEDBACK_HAS_USAGE_STEP_KEY]: 14,
  [SIGNUP_DRIP_DAY14_POST_PURCHASE_STEP_KEY]: 14,
  [SIGNUP_DRIP_DAY30_POST_PURCHASE_STEP_KEY]: 30,
  [SIGNUP_DRIP_REENGAGEMENT_STEP_KEY]: 30,
};
const DEFAULT_QUERY_LIMIT = 100;
const POSTS_COLLECTION = 'Posts';

export type SignupDripStepKey = (typeof SIGNUP_DRIP_STEP_SEQUENCE)[number];
export type SignupDripRoleTrack = 'athlete' | 'team';
export type SignupDripPaymentState = 'unknown' | 'unpaid' | 'paid' | 'org-covered';
export type SignupDripSuppressionReason =
  'completed' | 'marketing-disabled' | 'profile-activated' | 'agent-activated' | 'paid-converted';

export interface SignupDripHistoryEntry {
  readonly stepKey: SignupDripStepKey;
  readonly sentAt: Date;
  readonly roleTrack: SignupDripRoleTrack;
  readonly paymentState: SignupDripPaymentState;
}

export interface SignupDripStateRecord {
  readonly campaignKey: typeof SIGNUP_DRIP_CAMPAIGN_KEY;
  readonly enrolledAt: Date;
  readonly roleTrack: SignupDripRoleTrack;
  readonly paymentState: SignupDripPaymentState;
  readonly hasAgentXActivity?: boolean;
  readonly trialCreditsFinished?: boolean;
  readonly firstPurchaseAt?: Date;
  readonly currentStepKey: SignupDripStepKey;
  readonly lastSentStepKey?: SignupDripStepKey;
  readonly lastSentAt?: Date;
  readonly nextEligibleAt: Date;
  readonly completedAt?: Date;
  readonly pausedAt?: Date;
  readonly suppressionReason?: SignupDripSuppressionReason;
  readonly history?: SignupDripHistoryEntry[];
}

interface SignupDripUserSnapshot {
  readonly id: string;
  readonly email?: string;
  readonly firstName?: string;
  readonly role: UserRole;
  readonly primarySport?: string;
  readonly organizationName?: string;
  readonly marketingEnabled?: boolean;
  readonly agentXLastActiveAt?: Date | null;
  readonly trialCreditsFinished?: boolean;
  readonly firstPurchaseAt?: Date | null;
  readonly state: SignupDripStateRecord;
  readonly hasProfileImage: boolean;
  readonly hasBio: boolean;
  readonly hasConnectedSources: boolean;
  readonly hasClassYear: boolean;
  readonly hasPositions: boolean;
}

interface SignupDripActivationSignals {
  readonly hasMeaningfulProfile: boolean;
  readonly hasTimelinePost: boolean;
  readonly hasAgentXActivity: boolean;
  readonly trialCreditsFinished: boolean;
  readonly firstPurchaseAt?: Date | null;
  readonly setupFocusAreas: readonly string[];
}

type SignupDripDecision =
  | { readonly action: 'pause'; readonly reason: 'marketing-disabled' }
  | {
      readonly action: 'advance';
      readonly reason: 'profile-activated' | 'agent-activated' | 'paid-converted' | 'completed';
    }
  | { readonly action: 'send' }
  | { readonly action: 'complete'; readonly reason: 'completed' };

interface EnrollSignupDripInput {
  readonly db: FirebaseFirestore.Firestore;
  readonly userId: string;
  readonly role: UserRole;
  readonly now?: Date;
}

export interface EnrollSignupDripResult {
  readonly status: 'enrolled' | 'skipped';
  readonly reason?: 'already-enrolled';
  readonly state?: SignupDripStateRecord;
}

export interface SignupDripProcessingResult {
  readonly userId: string;
  readonly outcome: 'sent' | 'advanced' | 'paused' | 'completed' | 'skipped' | 'failed';
  readonly stepKey?: SignupDripStepKey;
  readonly reason?: string;
  readonly campaignKey?: string;
}

export interface RunSignupDripCampaignResult {
  readonly processedCount: number;
  readonly sentCount: number;
  readonly advancedCount: number;
  readonly pausedCount: number;
  readonly completedCount: number;
  readonly failedCount: number;
  readonly results: SignupDripProcessingResult[];
}

interface RunSignupDripCampaignInput {
  readonly db: FirebaseFirestore.Firestore;
  readonly environment: RuntimeEnvironment;
  readonly now?: Date;
  readonly limit?: number;
}

function addDays(baseDate: Date, days: number): Date {
  return new Date(baseDate.getTime() + days * 24 * 60 * 60 * 1000);
}

function toDate(value: unknown): Date | null {
  if (!value) return null;
  if (value instanceof Date) return value;

  if (typeof value === 'string') {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  if (typeof value === 'object') {
    const candidate = value as { toDate?: () => Date; seconds?: number; _seconds?: number };
    if (typeof candidate.toDate === 'function') {
      return candidate.toDate();
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

export function getSignupDripRoleTrack(role: UserRole): SignupDripRoleTrack {
  return isTeamRole(role) ? 'team' : 'athlete';
}

function getStepEligibleAt(enrolledAt: Date, stepKey: SignupDripStepKey): Date {
  return addDays(enrolledAt, SIGNUP_DRIP_DAY_OFFSETS[stepKey]);
}

function getStepEligibleAtForState(state: SignupDripStateRecord, stepKey: SignupDripStepKey): Date {
  const anchor =
    stepKey === SIGNUP_DRIP_DAY14_POST_PURCHASE_STEP_KEY ||
    stepKey === SIGNUP_DRIP_DAY30_POST_PURCHASE_STEP_KEY
      ? (state.firstPurchaseAt ?? state.enrolledAt)
      : state.enrolledAt;

  return addDays(anchor, SIGNUP_DRIP_DAY_OFFSETS[stepKey]);
}

function getNextStepKey(stepKey: SignupDripStepKey): SignupDripStepKey | null {
  const currentIndex = SIGNUP_DRIP_STEP_SEQUENCE.indexOf(stepKey);
  if (currentIndex === -1 || currentIndex >= SIGNUP_DRIP_STEP_SEQUENCE.length - 1) {
    return null;
  }

  return SIGNUP_DRIP_STEP_SEQUENCE[currentIndex + 1];
}

function resolveStepLabel(stepKey: SignupDripStepKey): string {
  return SIGNUP_DRIP_STEP_LABELS[stepKey];
}

export function buildSignupDripNotionFollowUpPlan(input: {
  readonly sentStepKey: SignupDripStepKey;
  readonly nextStepKey: SignupDripStepKey | null;
  readonly nextFollowUpAt: Date | null;
  readonly sentAt: Date;
}): { readonly note: string; readonly nextAction: string; readonly nextFollowUpAt: Date | null } {
  const sentStepLabel = resolveStepLabel(input.sentStepKey);

  if (input.nextStepKey && input.nextFollowUpAt) {
    const nextStepLabel = resolveStepLabel(input.nextStepKey);
    return {
      note: `[Signup Drip] ${sentStepLabel} sent at ${input.sentAt.toISOString()}. Next drip: ${nextStepLabel} on ${input.nextFollowUpAt.toISOString()}.`,
      nextAction: `Monitor engagement from ${sentStepLabel} and prepare ${nextStepLabel} outreach.`,
      nextFollowUpAt: input.nextFollowUpAt,
    };
  }

  return {
    note: `[Signup Drip] ${sentStepLabel} (final step) sent at ${input.sentAt.toISOString()}. Signup drip campaign completed.`,
    nextAction:
      'Signup drip sequence complete. Move this account to manual nurture or sales follow-up as needed.',
    nextFollowUpAt: null,
  };
}

export function buildInitialSignupDripState(
  role: UserRole,
  now: Date = new Date()
): SignupDripStateRecord {
  return {
    campaignKey: SIGNUP_DRIP_CAMPAIGN_KEY,
    enrolledAt: now,
    roleTrack: getSignupDripRoleTrack(role),
    paymentState: 'unknown',
    currentStepKey: SIGNUP_DRIP_PROFILE_SETUP_STEP_KEY,
    nextEligibleAt: getStepEligibleAt(now, SIGNUP_DRIP_PROFILE_SETUP_STEP_KEY),
    history: [],
  };
}

async function writeSignupDripState(
  db: FirebaseFirestore.Firestore,
  userId: string,
  state: SignupDripStateRecord
): Promise<void> {
  await db
    .collection('Users')
    .doc(userId)
    .update({
      'lifecycle.signup.drip.campaignKey': state.campaignKey,
      'lifecycle.signup.drip.enrolledAt': state.enrolledAt,
      'lifecycle.signup.drip.roleTrack': state.roleTrack,
      'lifecycle.signup.drip.paymentState': state.paymentState,
      'lifecycle.signup.drip.hasAgentXActivity': state.hasAgentXActivity ?? FieldValue.delete(),
      'lifecycle.signup.drip.trialCreditsFinished':
        state.trialCreditsFinished ?? FieldValue.delete(),
      'lifecycle.signup.drip.firstPurchaseAt': state.firstPurchaseAt ?? FieldValue.delete(),
      'lifecycle.signup.drip.currentStepKey': state.currentStepKey,
      'lifecycle.signup.drip.lastSentStepKey': state.lastSentStepKey ?? FieldValue.delete(),
      'lifecycle.signup.drip.lastSentAt': state.lastSentAt ?? FieldValue.delete(),
      'lifecycle.signup.drip.nextEligibleAt': state.nextEligibleAt,
      'lifecycle.signup.drip.completedAt': state.completedAt ?? FieldValue.delete(),
      'lifecycle.signup.drip.pausedAt': state.pausedAt ?? FieldValue.delete(),
      'lifecycle.signup.drip.suppressionReason': state.suppressionReason ?? FieldValue.delete(),
      'lifecycle.signup.drip.history': state.history ?? [],
    });
}

function resolvePrimarySport(user: UserV2Document): string | undefined {
  if (!Array.isArray(user.sports) || user.sports.length === 0) {
    return undefined;
  }

  const activeIndex =
    typeof user.activeSportIndex === 'number' && user.activeSportIndex >= 0
      ? user.activeSportIndex
      : 0;
  return user.sports[activeIndex]?.sport ?? user.sports[0]?.sport;
}

function resolveOrganizationName(user: UserV2Document): string | undefined {
  const coachOrganization = user.coach?.organization?.trim();
  if (coachOrganization) return coachOrganization;

  const teamName = user.teamCode?.teamName?.trim();
  if (teamName) return teamName;

  const legacyOrganization = user.organization?.trim();
  return legacyOrganization || undefined;
}

function hasPositions(user: UserV2Document): boolean {
  return Array.isArray(user.sports)
    ? user.sports.some((sport) => Array.isArray(sport.positions) && sport.positions.length > 0)
    : false;
}

function resolveMarketingEnabled(user: UserV2Document): boolean | undefined {
  const preferences = user.preferences;
  if (!preferences || typeof preferences !== 'object') {
    return undefined;
  }

  const value = (preferences as Record<string, unknown>)['marketingEmailsEnabled'];
  return typeof value === 'boolean' ? value : undefined;
}

function parseSignupDripState(rawValue: unknown, role: UserRole): SignupDripStateRecord | null {
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

  if (!SIGNUP_DRIP_STEP_SEQUENCE.includes(currentStepKey as SignupDripStepKey)) {
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

          if (
            !sentAt ||
            typeof stepKey !== 'string' ||
            !SIGNUP_DRIP_STEP_SEQUENCE.includes(stepKey as SignupDripStepKey) ||
            (roleTrack !== 'athlete' && roleTrack !== 'team') ||
            !['unknown', 'unpaid', 'paid', 'org-covered'].includes(String(paymentState))
          ) {
            return null;
          }

          return {
            stepKey: stepKey as SignupDripStepKey,
            sentAt,
            roleTrack: roleTrack as SignupDripRoleTrack,
            paymentState: paymentState as SignupDripPaymentState,
          };
        })
        .filter((entry): entry is SignupDripHistoryEntry => entry !== null)
    : [];

  return {
    campaignKey: SIGNUP_DRIP_CAMPAIGN_KEY,
    enrolledAt,
    roleTrack: raw['roleTrack'] === 'team' ? 'team' : getSignupDripRoleTrack(role),
    paymentState: ['unknown', 'unpaid', 'paid', 'org-covered'].includes(String(raw['paymentState']))
      ? (raw['paymentState'] as SignupDripPaymentState)
      : 'unknown',
    hasAgentXActivity:
      typeof raw['hasAgentXActivity'] === 'boolean'
        ? (raw['hasAgentXActivity'] as boolean)
        : undefined,
    trialCreditsFinished:
      typeof raw['trialCreditsFinished'] === 'boolean'
        ? (raw['trialCreditsFinished'] as boolean)
        : undefined,
    firstPurchaseAt: toDate(raw['firstPurchaseAt']) ?? undefined,
    currentStepKey: currentStepKey as SignupDripStepKey,
    lastSentStepKey: SIGNUP_DRIP_STEP_SEQUENCE.includes(raw['lastSentStepKey'] as SignupDripStepKey)
      ? (raw['lastSentStepKey'] as SignupDripStepKey)
      : undefined,
    lastSentAt: toDate(raw['lastSentAt']) ?? undefined,
    nextEligibleAt,
    completedAt: toDate(raw['completedAt']) ?? undefined,
    pausedAt: toDate(raw['pausedAt']) ?? undefined,
    suppressionReason:
      typeof raw['suppressionReason'] === 'string'
        ? (raw['suppressionReason'] as SignupDripSuppressionReason)
        : undefined,
    history,
  };
}

export async function enrollSignupDrip(
  input: EnrollSignupDripInput
): Promise<EnrollSignupDripResult> {
  const userRef = input.db.collection('Users').doc(input.userId);
  const userSnap = await userRef.get();
  const existingDrip = userSnap.get('lifecycle.signup.drip') as SignupDripStateRecord | undefined;

  if (existingDrip?.enrolledAt || existingDrip?.completedAt) {
    return { status: 'skipped', reason: 'already-enrolled' };
  }

  const state = buildInitialSignupDripState(input.role, input.now);
  await writeSignupDripState(input.db, input.userId, state);

  return { status: 'enrolled', state };
}

function buildSetupFocusAreas(
  user: SignupDripUserSnapshot,
  hasTimelinePost: boolean
): readonly string[] {
  const items: string[] = [];
  const isTeam =
    typeof user.role === 'string' && ['coach', 'staff', 'director'].includes(user.role as string);

  if (!user.hasProfileImage) {
    items.push('Add a profile/program image so your account presents cleanly right away.');
  }
  if (!user.hasBio) {
    items.push('Add a short bio or description so NXT1 and other people have the right context.');
  }
  if (!user.hasPositions && !isTeam) {
    items.push('Add your sport positions so recommendations stay relevant.');
  }
  if (!user.hasConnectedSources) {
    items.push('Connect the sources or links that make your presence more complete.');
  }
  if (!user.hasClassYear && user.role === 'athlete') {
    items.push('Add your class year so planning and visibility stay aligned to your stage.');
  }
  if (!hasTimelinePost) {
    items.push('Publish or organize one real piece of content so your timeline has momentum.');
  }

  return items.slice(0, 3);
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
): Promise<SignupDripPaymentState> {
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
    logger.warn('[SignupDrip] Failed to resolve payment state', {
      userId,
      error: error instanceof Error ? error.message : String(error),
    });
    return 'unknown';
  }
}

async function buildUserSnapshot(
  doc: FirebaseFirestore.QueryDocumentSnapshot
): Promise<SignupDripUserSnapshot | null> {
  const user = doc.data() as UserV2Document;
  const role = user.role;
  if (!role) {
    return null;
  }

  const state = parseSignupDripState(doc.get('lifecycle.signup.drip'), role);
  if (!state || state.completedAt) {
    return null;
  }

  const dripObj = user.lifecycle?.signup?.drip as Record<string, unknown> | undefined;

  return {
    id: doc.id,
    email: user.email,
    firstName: user.firstName,
    role,
    primarySport: resolvePrimarySport(user),
    organizationName: resolveOrganizationName(user),
    marketingEnabled: resolveMarketingEnabled(user),
    agentXLastActiveAt:
      toDate(doc.get('agentXLastActiveAt') as PortableTimestamp | undefined) ??
      (dripObj?.['hasAgentXActivity'] ? new Date() : null),
    trialCreditsFinished: Boolean(dripObj?.['trialCreditsFinished']),
    firstPurchaseAt: toDate(dripObj?.['firstPurchaseAt']),
    state,
    hasProfileImage: Array.isArray(user.profileImgs) && user.profileImgs.length > 0,
    hasBio: typeof user.aboutMe === 'string' && user.aboutMe.trim().length > 0,
    hasConnectedSources: Array.isArray(user.connectedSources) && user.connectedSources.length > 0,
    hasClassYear: typeof user.classOf === 'number',
    hasPositions: hasPositions(user),
  };
}

async function buildActivationSignals(
  db: FirebaseFirestore.Firestore,
  user: SignupDripUserSnapshot
): Promise<SignupDripActivationSignals> {
  const timelinePost = await hasTimelinePost(db, user.id);

  return {
    hasMeaningfulProfile:
      [
        user.hasProfileImage,
        user.hasBio,
        user.hasConnectedSources,
        user.hasClassYear,
        user.hasPositions,
      ].filter(Boolean).length >= 2 || timelinePost,
    hasTimelinePost: timelinePost,
    hasAgentXActivity: Boolean(user.agentXLastActiveAt),
    trialCreditsFinished: Boolean(user.trialCreditsFinished),
    firstPurchaseAt: user.firstPurchaseAt,
    setupFocusAreas: buildSetupFocusAreas(user, timelinePost),
  };
}

export function evaluateSignupDripDecision(input: {
  readonly stepKey: SignupDripStepKey;
  readonly marketingEnabled?: boolean;
  readonly paymentState?: SignupDripPaymentState;
  readonly signals: SignupDripActivationSignals;
}): SignupDripDecision {
  if (input.marketingEnabled === false) {
    return { action: 'pause', reason: 'marketing-disabled' };
  }

  const isPaid = input.paymentState === 'paid' || input.paymentState === 'org-covered';

  if (input.stepKey === SIGNUP_DRIP_PROFILE_SETUP_STEP_KEY && input.signals.hasMeaningfulProfile) {
    return { action: 'advance', reason: 'profile-activated' };
  }

  if (input.stepKey === SIGNUP_DRIP_AGENT_ACTIVATION_STEP_KEY && input.signals.hasAgentXActivity) {
    return { action: 'advance', reason: 'agent-activated' };
  }

  if (input.stepKey === SIGNUP_DRIP_DAY3_INACTIVITY_STEP_KEY && input.signals.hasAgentXActivity) {
    return { action: 'advance', reason: 'agent-activated' };
  }

  if (
    input.stepKey === SIGNUP_DRIP_DAY7_MID_TRIAL_STEP_KEY &&
    (input.signals.trialCreditsFinished || isPaid)
  ) {
    return { action: 'advance', reason: 'paid-converted' };
  }

  if (
    input.stepKey === SIGNUP_DRIP_DAY14_FEEDBACK_NO_USAGE_STEP_KEY &&
    (input.signals.hasAgentXActivity || input.signals.trialCreditsFinished || isPaid)
  ) {
    return { action: 'advance', reason: 'agent-activated' };
  }

  if (
    input.stepKey === SIGNUP_DRIP_DAY14_FEEDBACK_HAS_USAGE_STEP_KEY &&
    (!input.signals.hasAgentXActivity || input.signals.trialCreditsFinished || isPaid)
  ) {
    return { action: 'advance', reason: 'paid-converted' };
  }

  if (input.stepKey === SIGNUP_DRIP_DAY14_POST_PURCHASE_STEP_KEY && !isPaid) {
    return { action: 'advance', reason: 'completed' };
  }

  if (input.stepKey === SIGNUP_DRIP_DAY30_POST_PURCHASE_STEP_KEY && !isPaid) {
    return { action: 'advance', reason: 'completed' };
  }

  return { action: 'send' };
}

function buildAdvancedState(
  state: SignupDripStateRecord,
  now: Date,
  paymentState: SignupDripPaymentState,
  reason: 'profile-activated' | 'agent-activated' | 'paid-converted' | 'completed'
): SignupDripStateRecord {
  const nextStepKey = getNextStepKey(state.currentStepKey);
  if (!nextStepKey) {
    return {
      ...state,
      paymentState,
      completedAt: now,
      nextEligibleAt: now,
      pausedAt: undefined,
      suppressionReason: 'completed',
    };
  }

  return {
    ...state,
    paymentState,
    currentStepKey: nextStepKey,
    nextEligibleAt: getStepEligibleAtForState(state, nextStepKey),
    pausedAt: undefined,
    suppressionReason: reason,
  };
}

function buildPausedState(
  state: SignupDripStateRecord,
  now: Date,
  paymentState: SignupDripPaymentState
): SignupDripStateRecord {
  return {
    ...state,
    paymentState,
    pausedAt: now,
    suppressionReason: 'marketing-disabled',
    nextEligibleAt: addDays(now, 1),
  };
}

function buildSentState(input: {
  readonly state: SignupDripStateRecord;
  readonly now: Date;
  readonly paymentState: SignupDripPaymentState;
}): SignupDripStateRecord {
  const nextStepKey = getNextStepKey(input.state.currentStepKey);
  const historyEntry: SignupDripHistoryEntry = {
    stepKey: input.state.currentStepKey,
    sentAt: input.now,
    roleTrack: input.state.roleTrack,
    paymentState: input.paymentState,
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
    nextEligibleAt: getStepEligibleAtForState(input.state, nextStepKey),
    pausedAt: undefined,
    suppressionReason: undefined,
    history: [...(input.state.history ?? []), historyEntry],
  };
}

async function processSignupDripUser(input: {
  readonly db: FirebaseFirestore.Firestore;
  readonly environment: RuntimeEnvironment;
  readonly user: SignupDripUserSnapshot;
  readonly now: Date;
}): Promise<SignupDripProcessingResult> {
  const paymentState = await resolvePaymentState(input.db, input.user.id);
  const signals = await buildActivationSignals(input.db, input.user);
  const decision = evaluateSignupDripDecision({
    stepKey: input.user.state.currentStepKey,
    marketingEnabled: input.user.marketingEnabled,
    paymentState,
    signals,
  });

  if (decision.action === 'pause') {
    await writeSignupDripState(
      input.db,
      input.user.id,
      buildPausedState(input.user.state, input.now, paymentState)
    );
    return {
      userId: input.user.id,
      outcome: 'paused',
      stepKey: input.user.state.currentStepKey,
      reason: decision.reason,
    };
  }

  if (decision.action === 'advance') {
    await writeSignupDripState(
      input.db,
      input.user.id,
      buildAdvancedState(input.user.state, input.now, paymentState, decision.reason)
    );
    return {
      userId: input.user.id,
      outcome: 'advanced',
      stepKey: input.user.state.currentStepKey,
      reason: decision.reason,
    };
  }

  let emailResult: SignupDripEmailResult;
  try {
    emailResult = await sendSignupDripEmail({
      userId: input.user.id,
      email: input.user.email,
      firstName: input.user.firstName,
      environment: input.environment,
      role: input.user.role,
      stepKey: input.user.state.currentStepKey,
      paymentState,
      primarySport: input.user.primarySport,
      organizationName: input.user.organizationName,
      marketingEnabled: input.user.marketingEnabled,
      setupFocusAreas: signals.setupFocusAreas,
    });
  } catch (error) {
    logger.error('[SignupDrip] Email send failed', {
      userId: input.user.id,
      stepKey: input.user.state.currentStepKey,
      error: error instanceof Error ? error.message : String(error),
    });
    return {
      userId: input.user.id,
      outcome: 'failed',
      stepKey: input.user.state.currentStepKey,
      reason: 'email-send-failed',
    };
  }

  if (emailResult.status === 'skipped') {
    const nextState =
      emailResult.reason === 'marketing-disabled'
        ? buildPausedState(input.user.state, input.now, paymentState)
        : {
            ...input.user.state,
            paymentState,
            nextEligibleAt: addDays(input.now, 7),
          };

    await writeSignupDripState(input.db, input.user.id, nextState);
    return {
      userId: input.user.id,
      outcome: emailResult.reason === 'marketing-disabled' ? 'paused' : 'skipped',
      stepKey: input.user.state.currentStepKey,
      reason: emailResult.reason,
    };
  }

  const sentState = buildSentState({
    state: input.user.state,
    now: input.now,
    paymentState,
  });

  await writeSignupDripState(input.db, input.user.id, sentState);

  // Keep B2B Partners outreach counters in sync when drip emails are sent.
  if (input.user.email) {
    const followUpPlan = buildSignupDripNotionFollowUpPlan({
      sentStepKey: input.user.state.currentStepKey,
      nextStepKey: getNextStepKey(input.user.state.currentStepKey),
      nextFollowUpAt: sentState.suppressionReason === 'completed' ? null : sentState.nextEligibleAt,
      sentAt: input.now,
    });

    await recordB2BPartnerContactEvent({
      environment: input.environment,
      email: input.user.email,
      contactedAt: input.now,
      note: followUpPlan.note,
      nextAction: followUpPlan.nextAction,
      nextFollowUpAt: followUpPlan.nextFollowUpAt,
    }).catch((error: unknown) => {
      logger.warn('[SignupDrip] Notion contact-event sync skipped/failed', {
        userId: input.user.id,
        stepKey: input.user.state.currentStepKey,
        error: error instanceof Error ? error.message : String(error),
      });
    });
  }

  return {
    userId: input.user.id,
    outcome: 'sent',
    stepKey: input.user.state.currentStepKey,
    campaignKey: emailResult.campaignKey,
  };
}

export async function runSignupDripCampaign(
  input: RunSignupDripCampaignInput
): Promise<RunSignupDripCampaignResult> {
  const now = input.now ?? new Date();
  const limit = input.limit ?? DEFAULT_QUERY_LIMIT;
  const snapshot = await input.db
    .collection('Users')
    .where('lifecycle.signup.drip.nextEligibleAt', '<=', now)
    .orderBy('lifecycle.signup.drip.nextEligibleAt', 'asc')
    .limit(limit)
    .get();

  const results: SignupDripProcessingResult[] = [];

  for (const doc of snapshot.docs) {
    try {
      const user = await buildUserSnapshot(doc);
      if (!user) {
        results.push({ userId: doc.id, outcome: 'skipped', reason: 'no-active-drip-state' });
        continue;
      }

      results.push(
        await processSignupDripUser({
          db: input.db,
          environment: input.environment,
          user,
          now,
        })
      );
    } catch (error) {
      logger.error('[SignupDrip] Failed processing user', {
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
    results,
  };
}
