import { describe, expect, it } from 'vitest';

import {
  PUSH_DRIP_ACTIVATION_STEP_KEY,
  PUSH_DRIP_REENGAGEMENT_STEP_KEY,
  PUSH_DRIP_WELCOME_STEP_KEY,
  buildInitialPushDripState,
  evaluatePushDripDecision,
} from '../push-drip.service.js';

describe('push-drip lifecycle decisions', () => {
  it('starts new drips on the welcome step with a delayed day-1 eligibility', () => {
    const now = new Date('2026-05-25T10:00:00.000Z');
    const state = buildInitialPushDripState('athlete', now);

    expect(state.currentStepKey).toBe(PUSH_DRIP_WELCOME_STEP_KEY);
    expect(state.roleTrack).toBe('athlete');
    expect(state.nextEligibleAt.toISOString()).toBe('2026-05-26T10:00:00.000Z');
  });

  it('pauses when push is disabled', () => {
    const decision = evaluatePushDripDecision({
      stepKey: PUSH_DRIP_WELCOME_STEP_KEY,
      pushEnabled: false,
      marketingPushEnabled: true,
      signals: {
        hasMeaningfulProfile: false,
        hasAgentXActivity: false,
        hasTeamContext: false,
        roleTargetAchieved: false,
      },
      inQuietHours: false,
      exceedsCadenceCap: false,
      now: new Date('2026-05-25T10:00:00.000Z'),
    });

    expect(decision).toEqual({ action: 'pause', reason: 'push-disabled' });
  });

  it('defers sends during quiet hours', () => {
    const decision = evaluatePushDripDecision({
      stepKey: PUSH_DRIP_ACTIVATION_STEP_KEY,
      pushEnabled: true,
      marketingPushEnabled: true,
      signals: {
        hasMeaningfulProfile: true,
        hasAgentXActivity: false,
        hasTeamContext: false,
        roleTargetAchieved: false,
      },
      inQuietHours: true,
      exceedsCadenceCap: false,
      now: new Date('2026-05-25T10:00:00.000Z'),
      retryDelayMinutes: 90,
    });

    expect(decision).toEqual({
      action: 'defer',
      reason: 'quiet-hours',
      nextEligibleAt: new Date('2026-05-25T11:30:00.000Z'),
    });
  });

  it('advances early when role activation is already achieved before the final step', () => {
    const decision = evaluatePushDripDecision({
      stepKey: PUSH_DRIP_ACTIVATION_STEP_KEY,
      pushEnabled: true,
      marketingPushEnabled: true,
      signals: {
        hasMeaningfulProfile: true,
        hasAgentXActivity: true,
        hasTeamContext: false,
        roleTargetAchieved: true,
      },
      inQuietHours: false,
      exceedsCadenceCap: false,
      now: new Date('2026-05-25T10:00:00.000Z'),
    });

    expect(decision).toEqual({ action: 'advance', reason: 'target-achieved' });
  });

  it('completes at the final step when the role target is already achieved', () => {
    const decision = evaluatePushDripDecision({
      stepKey: PUSH_DRIP_REENGAGEMENT_STEP_KEY,
      pushEnabled: true,
      marketingPushEnabled: true,
      signals: {
        hasMeaningfulProfile: true,
        hasAgentXActivity: true,
        hasTeamContext: true,
        roleTargetAchieved: true,
      },
      inQuietHours: false,
      exceedsCadenceCap: false,
      now: new Date('2026-05-25T10:00:00.000Z'),
    });

    expect(decision).toEqual({ action: 'complete', reason: 'target-achieved' });
  });
});
