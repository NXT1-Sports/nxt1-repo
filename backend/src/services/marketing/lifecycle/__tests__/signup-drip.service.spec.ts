import { describe, expect, it } from 'vitest';

import {
  SIGNUP_DRIP_PROFILE_SETUP_STEP_KEY,
  SIGNUP_DRIP_DAY3_INACTIVITY_STEP_KEY,
  SIGNUP_DRIP_DAY7_MID_TRIAL_STEP_KEY,
  SIGNUP_DRIP_DAY14_POST_PURCHASE_STEP_KEY,
  SIGNUP_DRIP_REENGAGEMENT_STEP_KEY,
  buildInitialSignupDripState,
  evaluateSignupDripDecision,
} from '../signup-drip.service.js';

describe('signup-drip lifecycle decisions', () => {
  it('starts new drips on the profile setup step with a delayed day-3 eligibility', () => {
    const now = new Date('2026-05-25T10:00:00.000Z');
    const state = buildInitialSignupDripState('athlete', now);

    expect(state.currentStepKey).toBe(SIGNUP_DRIP_PROFILE_SETUP_STEP_KEY);
    expect(state.roleTrack).toBe('athlete');
    expect(state.nextEligibleAt.toISOString()).toBe('2026-05-28T10:00:00.000Z');
  });

  it('pauses when marketing emails are disabled', () => {
    const decision = evaluateSignupDripDecision({
      stepKey: SIGNUP_DRIP_PROFILE_SETUP_STEP_KEY,
      marketingEnabled: false,
      signals: {
        hasMeaningfulProfile: false,
        hasTimelinePost: false,
        hasAgentXActivity: false,
        trialCreditsFinished: false,
        setupFocusAreas: ['Add a profile image.'],
      },
    });

    expect(decision).toEqual({ action: 'pause', reason: 'marketing-disabled' });
  });

  it('advances past the setup step once the user already has strong profile signals', () => {
    const decision = evaluateSignupDripDecision({
      stepKey: SIGNUP_DRIP_PROFILE_SETUP_STEP_KEY,
      marketingEnabled: true,
      signals: {
        hasMeaningfulProfile: true,
        hasTimelinePost: true,
        hasAgentXActivity: false,
        trialCreditsFinished: false,
        setupFocusAreas: [],
      },
    });

    expect(decision).toEqual({ action: 'advance', reason: 'profile-activated' });
  });

  it('advances past the day 3 inactivity nudge if Agent X is already active', () => {
    const decision = evaluateSignupDripDecision({
      stepKey: SIGNUP_DRIP_DAY3_INACTIVITY_STEP_KEY,
      marketingEnabled: true,
      signals: {
        hasMeaningfulProfile: true,
        hasTimelinePost: false,
        hasAgentXActivity: true,
        trialCreditsFinished: false,
        setupFocusAreas: [],
      },
    });

    expect(decision).toEqual({ action: 'advance', reason: 'agent-activated' });
  });

  it('advances past mid-trial step if user converted to paid plan', () => {
    const decision = evaluateSignupDripDecision({
      stepKey: SIGNUP_DRIP_DAY7_MID_TRIAL_STEP_KEY,
      marketingEnabled: true,
      paymentState: 'paid',
      signals: {
        hasMeaningfulProfile: true,
        hasTimelinePost: false,
        hasAgentXActivity: true,
        trialCreditsFinished: false,
        setupFocusAreas: [],
      },
    });

    expect(decision).toEqual({ action: 'advance', reason: 'paid-converted' });
  });

  it('evaluates post-purchase check-in steps for paid users', () => {
    const decision = evaluateSignupDripDecision({
      stepKey: SIGNUP_DRIP_DAY14_POST_PURCHASE_STEP_KEY,
      marketingEnabled: true,
      paymentState: 'paid',
      signals: {
        hasMeaningfulProfile: true,
        hasTimelinePost: true,
        hasAgentXActivity: true,
        trialCreditsFinished: true,
        setupFocusAreas: [],
      },
    });

    expect(decision).toEqual({ action: 'send' });
  });

  it('advances post-purchase check-in steps if user is unpaid', () => {
    const decision = evaluateSignupDripDecision({
      stepKey: SIGNUP_DRIP_DAY14_POST_PURCHASE_STEP_KEY,
      marketingEnabled: true,
      paymentState: 'unpaid',
      signals: {
        hasMeaningfulProfile: true,
        hasTimelinePost: true,
        hasAgentXActivity: false,
        trialCreditsFinished: false,
        setupFocusAreas: [],
      },
    });

    expect(decision).toEqual({ action: 'advance', reason: 'completed' });
  });

  it('still sends the day-30 reengagement step when the campaign reaches the final stage', () => {
    const decision = evaluateSignupDripDecision({
      stepKey: SIGNUP_DRIP_REENGAGEMENT_STEP_KEY,
      marketingEnabled: true,
      signals: {
        hasMeaningfulProfile: true,
        hasTimelinePost: true,
        hasAgentXActivity: true,
        trialCreditsFinished: false,
        setupFocusAreas: [],
      },
    });

    expect(decision).toEqual({ action: 'send' });
  });
});
