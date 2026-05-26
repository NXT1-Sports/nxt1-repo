/**
 * @fileoverview Completed Signup Lifecycle Service
 * @module @nxt1/backend/services/marketing/lifecycle/completed-signup-lifecycle
 *
 * Centralizes professional post-signup operations for newly completed users.
 * Keeps auth routes focused on onboarding persistence while lifecycle messaging
 * remains reusable and extensible for future automation.
 */

import { FieldValue } from 'firebase-admin/firestore';
import { isTeamRole } from '@nxt1/core';
import type { UserRole } from '@nxt1/core';
import type { RuntimeEnvironment } from '../../../config/runtime-environment.js';
import { toAbsoluteAppUrl } from '../../../utils/app-url.js';
import { logger } from '../../../utils/logger.js';
import { sendSlackAlert } from '../../platform/alert.service.js';
import {
  sendWelcomeOnboardingEmail,
  type WelcomeOnboardingEmailResult,
} from '../email/campaigns/welcome/welcome-onboarding-email.service.js';
import { enrollPushDrip } from './push-drip.service.js';
import { enrollSignupDrip } from './signup-drip.service.js';

interface CompletedSignupLifecycleInput {
  readonly db: FirebaseFirestore.Firestore;
  readonly userId: string;
  readonly environment: RuntimeEnvironment;
  readonly role: UserRole;
  readonly firstName?: string | null;
  readonly lastName?: string | null;
  readonly displayName?: string | null;
  readonly email?: string | null;
  readonly primarySport?: string | null;
  readonly teamName?: string | null;
  readonly teamId?: string | null;
  readonly organizationId?: string | null;
  readonly city?: string | null;
  readonly state?: string | null;
  readonly referralId?: string | null;
  readonly teamCode?: string | null;
  readonly teamCodeName?: string | null;
  readonly marketingEnabled?: boolean;
  readonly slackAlertAlreadySent?: boolean;
  readonly welcomeEmailAlreadySent?: boolean;
}

type SignupSlackResult =
  | { readonly status: 'sent' }
  | { readonly status: 'skipped'; readonly reason: 'already-sent' }
  | { readonly status: 'failed'; readonly reason: 'delivery-failed' | 'exception' };

export interface CompletedSignupLifecycleResult {
  readonly slack: SignupSlackResult;
  readonly welcomeEmail:
    | WelcomeOnboardingEmailResult
    | { readonly status: 'skipped'; readonly reason: 'already-sent' }
    | { readonly status: 'failed'; readonly reason: 'exception' };
  readonly dripEnrollment:
    | { readonly status: 'enrolled' }
    | { readonly status: 'skipped'; readonly reason: 'already-enrolled' }
    | { readonly status: 'failed'; readonly reason: 'exception' };
  readonly pushDripEnrollment:
    | { readonly status: 'enrolled' }
    | { readonly status: 'skipped'; readonly reason: 'already-enrolled' }
    | { readonly status: 'failed'; readonly reason: 'exception' };
}

function resolveDisplayName(input: CompletedSignupLifecycleInput): string {
  const explicit = input.displayName?.trim();
  if (explicit) return explicit;

  const parts = [input.firstName?.trim(), input.lastName?.trim()].filter((value): value is string =>
    Boolean(value)
  );
  if (parts.length > 0) return parts.join(' ');

  return 'New NXT1 User';
}

function pushField(
  fields: Array<{ label: string; value: string }>,
  label: string,
  value: string | null | undefined
): void {
  const normalized = value?.trim();
  if (normalized) {
    fields.push({ label, value: normalized });
  }
}

async function markLifecycleTimestamp(
  db: FirebaseFirestore.Firestore,
  userId: string,
  fieldPath: 'lifecycle.signup.completedSlackAlertSentAt' | 'lifecycle.signup.welcomeEmailSentAt'
): Promise<void> {
  await db
    .collection('Users')
    .doc(userId)
    .update({
      [fieldPath]: FieldValue.serverTimestamp(),
    });
}

async function sendCompletedSignupSlackAlert(
  input: CompletedSignupLifecycleInput
): Promise<SignupSlackResult> {
  if (input.slackAlertAlreadySent) {
    return { status: 'skipped', reason: 'already-sent' };
  }

  const isTeamSignup = isTeamRole(input.role);
  const fields: Array<{ label: string; value: string }> = [];
  const displayName = resolveDisplayName(input);
  const profileUrl = toAbsoluteAppUrl(`/profile/${input.userId}`, {
    environment: input.environment,
  });

  pushField(fields, 'Name', displayName);
  pushField(fields, 'Email', input.email ?? undefined);
  pushField(fields, 'Role', input.role);
  pushField(fields, 'Primary Sport', input.primarySport ?? undefined);
  pushField(fields, isTeamSignup ? 'Program' : 'Team', input.teamName ?? undefined);
  pushField(fields, 'Organization ID', input.organizationId ?? undefined);
  pushField(fields, 'Team ID', input.teamId ?? undefined);
  pushField(
    fields,
    'Location',
    [input.city?.trim(), input.state?.trim()].filter(Boolean).join(', ') || undefined
  );
  pushField(fields, 'Referral ID', input.referralId ?? undefined);
  pushField(
    fields,
    'Team Code',
    input.teamCode
      ? input.teamCodeName
        ? `${input.teamCode} (${input.teamCodeName})`
        : input.teamCode
      : undefined
  );
  pushField(fields, 'Environment', input.environment);

  try {
    const delivered = await sendSlackAlert({
      target: isTeamSignup ? 'signup_team' : 'signup_athlete',
      severity: 'info',
      title: isTeamSignup ? 'New Team / Staff Signup' : 'New Athlete Signup',
      summary: `${displayName} completed onboarding and is ready for follow-up inside NXT1.`,
      fields,
      linkText: 'Open Profile',
      linkUrl: profileUrl,
    });

    if (!delivered) {
      return { status: 'failed', reason: 'delivery-failed' };
    }

    return { status: 'sent' };
  } catch (error) {
    logger.error('[CompletedSignupLifecycle] Slack alert dispatch failed', {
      userId: input.userId,
      role: input.role,
      error: error instanceof Error ? error.message : String(error),
    });

    return { status: 'failed', reason: 'exception' };
  }
}

export async function processCompletedSignupLifecycle(
  input: CompletedSignupLifecycleInput
): Promise<CompletedSignupLifecycleResult> {
  const slackPromise = sendCompletedSignupSlackAlert(input);
  const welcomePromise = input.welcomeEmailAlreadySent
    ? Promise.resolve({ status: 'skipped', reason: 'already-sent' } as const)
    : sendWelcomeOnboardingEmail({
        userId: input.userId,
        email: input.email,
        firstName: input.firstName,
        environment: input.environment,
        role: input.role,
        primarySport: input.primarySport,
        organizationName: input.teamName,
        marketingEnabled: input.marketingEnabled,
      });

  const [slackResult, welcomeEmailResult] = await Promise.all([slackPromise, welcomePromise]);

  let dripEnrollmentResult: CompletedSignupLifecycleResult['dripEnrollment'];
  let pushDripEnrollmentResult: CompletedSignupLifecycleResult['pushDripEnrollment'];
  try {
    const result = await enrollSignupDrip({
      db: input.db,
      userId: input.userId,
      role: input.role,
    });
    dripEnrollmentResult =
      result.status === 'enrolled'
        ? { status: 'enrolled' }
        : { status: 'skipped', reason: 'already-enrolled' };
  } catch (error) {
    logger.error('[CompletedSignupLifecycle] Failed to enroll signup drip lifecycle', {
      userId: input.userId,
      role: input.role,
      error: error instanceof Error ? error.message : String(error),
    });
    dripEnrollmentResult = { status: 'failed', reason: 'exception' };
  }

  try {
    const result = await enrollPushDrip({
      db: input.db,
      userId: input.userId,
      role: input.role,
    });
    pushDripEnrollmentResult =
      result.status === 'enrolled'
        ? { status: 'enrolled' }
        : { status: 'skipped', reason: 'already-enrolled' };
  } catch (error) {
    logger.error('[CompletedSignupLifecycle] Failed to enroll push drip lifecycle', {
      userId: input.userId,
      role: input.role,
      error: error instanceof Error ? error.message : String(error),
    });
    pushDripEnrollmentResult = { status: 'failed', reason: 'exception' };
  }

  if (slackResult.status === 'sent') {
    try {
      await markLifecycleTimestamp(
        input.db,
        input.userId,
        'lifecycle.signup.completedSlackAlertSentAt'
      );
    } catch (error) {
      logger.error('[CompletedSignupLifecycle] Failed to persist Slack alert marker', {
        userId: input.userId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  if (welcomeEmailResult.status === 'sent') {
    try {
      await markLifecycleTimestamp(input.db, input.userId, 'lifecycle.signup.welcomeEmailSentAt');
    } catch (error) {
      logger.error('[CompletedSignupLifecycle] Failed to persist welcome email marker', {
        userId: input.userId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return {
    slack: slackResult,
    welcomeEmail: welcomeEmailResult,
    dripEnrollment: dripEnrollmentResult,
    pushDripEnrollment: pushDripEnrollmentResult,
  };
}
