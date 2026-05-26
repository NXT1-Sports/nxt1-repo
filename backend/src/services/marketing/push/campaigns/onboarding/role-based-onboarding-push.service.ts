import type { UserRole } from '@nxt1/core';
import type {
  PushDripPaymentState,
  PushDripStepKey,
} from '../../../lifecycle/push-drip.service.js';

export interface RoleBasedOnboardingPushInput {
  readonly role: UserRole;
  readonly stepKey: PushDripStepKey;
  readonly paymentState: PushDripPaymentState;
  readonly primarySport?: string;
  readonly organizationName?: string;
}

export interface RoleBasedOnboardingPushVariant {
  readonly campaignKey: string;
  readonly title: string;
  readonly body: string;
  readonly deepLink: string;
}

function buildAthleteVariant(input: RoleBasedOnboardingPushInput): RoleBasedOnboardingPushVariant {
  const sportLabel = input.primarySport?.trim() || 'your sport';

  switch (input.stepKey) {
    case 'welcome_nudge':
      return {
        campaignKey: 'push_onboarding_welcome_athlete',
        title: 'Finish your NXT1 setup',
        body: `Add your ${sportLabel} context so NXT1 can start working for you.`,
        deepLink: '/edit-profile',
      };
    case 'activation_nudge':
      return {
        campaignKey: 'push_onboarding_activation_athlete',
        title: 'Try Agent X on one real task',
        body: 'Ask Agent X for a real next step so your profile starts creating momentum.',
        deepLink: '/agent-x',
      };
    case 'reengagement_nudge':
      return {
        campaignKey: 'push_onboarding_reengagement_athlete',
        title: 'Come back and keep building momentum',
        body:
          input.paymentState === 'paid'
            ? 'You are set up. Come back and use Agent X on a real recruiting or profile task.'
            : 'You already started. Come back and finish one real action so NXT1 can keep working for you.',
        deepLink: '/agent-x',
      };
  }
}

function buildTeamVariant(input: RoleBasedOnboardingPushInput): RoleBasedOnboardingPushVariant {
  const organizationLabel = input.organizationName?.trim() || 'your program';
  const roleLabel = input.role === 'director' ? 'program' : 'team';

  switch (input.stepKey) {
    case 'welcome_nudge':
      return {
        campaignKey: `push_onboarding_welcome_${input.role}`,
        title: `Finish setting up ${organizationLabel}`,
        body: `Lock in ${roleLabel} context so NXT1 can support real staff workflows.`,
        deepLink: '/manage-team',
      };
    case 'activation_nudge':
      return {
        campaignKey: `push_onboarding_activation_${input.role}`,
        title: 'Give Agent X one real workflow',
        body: 'Use Agent X on one real team or operations task so the system starts compounding value.',
        deepLink: '/agent-x',
      };
    case 'reengagement_nudge':
      return {
        campaignKey: `push_onboarding_reengagement_${input.role}`,
        title: 'Make NXT1 part of the workflow',
        body:
          input.paymentState === 'org-covered' || input.paymentState === 'paid'
            ? 'Your access is ready. Come back and run one real workflow through Agent X.'
            : 'Your setup is in motion. Come back and turn NXT1 into a real staff workflow.',
        deepLink: '/agent-x',
      };
  }
}

export function buildRoleBasedOnboardingPushVariant(
  input: RoleBasedOnboardingPushInput
): RoleBasedOnboardingPushVariant {
  return input.role === 'athlete' ? buildAthleteVariant(input) : buildTeamVariant(input);
}
