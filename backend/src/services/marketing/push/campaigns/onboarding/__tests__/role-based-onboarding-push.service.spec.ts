import { describe, expect, it } from 'vitest';

import { buildRoleBasedOnboardingPushVariant } from '../role-based-onboarding-push.service.js';

describe('role-based onboarding push variants', () => {
  it('builds athlete activation copy around Agent X momentum', () => {
    const variant = buildRoleBasedOnboardingPushVariant({
      role: 'athlete',
      stepKey: 'activation_nudge',
      paymentState: 'paid',
      primarySport: 'basketball',
    });

    expect(variant.campaignKey).toBe('push_onboarding_activation_athlete');
    expect(variant.title).toBe('Try Agent X on one real task');
    expect(variant.deepLink).toBe('/agent-x');
  });

  it('builds team-oriented welcome copy for coaches', () => {
    const variant = buildRoleBasedOnboardingPushVariant({
      role: 'coach',
      stepKey: 'welcome_nudge',
      paymentState: 'org-covered',
      organizationName: 'NXT1 FC',
    });

    expect(variant.campaignKey).toBe('push_onboarding_welcome_coach');
    expect(variant.title).toContain('NXT1 FC');
    expect(variant.body).toContain('team context');
    expect(variant.deepLink).toBe('/manage-team');
  });
});
