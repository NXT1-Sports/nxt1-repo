import { describe, expect, it } from 'vitest';

import { summarizePushDripStates } from '../push-drip-report.service.js';
import {
  PUSH_DRIP_CAMPAIGN_KEY,
  PUSH_DRIP_ACTIVATION_STEP_KEY,
  PUSH_DRIP_REENGAGEMENT_STEP_KEY,
  PUSH_DRIP_WELCOME_STEP_KEY,
  type PushDripStateRecord,
} from '../push-drip.service.js';

describe('push-drip report summary', () => {
  it('summarizes active, paused, completed, and recent send activity', () => {
    const now = new Date('2026-05-25T12:00:00.000Z');
    const states: PushDripStateRecord[] = [
      {
        campaignKey: PUSH_DRIP_CAMPAIGN_KEY,
        enrolledAt: new Date('2026-05-20T12:00:00.000Z'),
        roleTrack: 'athlete',
        paymentState: 'paid',
        currentStepKey: PUSH_DRIP_ACTIVATION_STEP_KEY,
        nextEligibleAt: new Date('2026-05-24T12:00:00.000Z'),
        history: [
          {
            stepKey: PUSH_DRIP_WELCOME_STEP_KEY,
            sentAt: new Date('2026-05-24T10:00:00.000Z'),
            roleTrack: 'athlete',
            paymentState: 'paid',
            campaignKey: 'push_onboarding_welcome_athlete',
          },
        ],
      },
      {
        campaignKey: PUSH_DRIP_CAMPAIGN_KEY,
        enrolledAt: new Date('2026-05-18T12:00:00.000Z'),
        roleTrack: 'coach',
        paymentState: 'org-covered',
        currentStepKey: PUSH_DRIP_REENGAGEMENT_STEP_KEY,
        nextEligibleAt: new Date('2026-05-26T12:00:00.000Z'),
        pausedAt: new Date('2026-05-25T08:00:00.000Z'),
        suppressionReason: 'quiet-hours',
        history: [],
      },
      {
        campaignKey: PUSH_DRIP_CAMPAIGN_KEY,
        enrolledAt: new Date('2026-05-15T12:00:00.000Z'),
        roleTrack: 'director',
        paymentState: 'unpaid',
        currentStepKey: PUSH_DRIP_REENGAGEMENT_STEP_KEY,
        nextEligibleAt: new Date('2026-05-22T12:00:00.000Z'),
        completedAt: new Date('2026-05-23T12:00:00.000Z'),
        suppressionReason: 'completed',
        history: [
          {
            stepKey: PUSH_DRIP_WELCOME_STEP_KEY,
            sentAt: new Date('2026-05-16T10:00:00.000Z'),
            roleTrack: 'director',
            paymentState: 'unpaid',
            campaignKey: 'push_onboarding_welcome_director',
          },
          {
            stepKey: PUSH_DRIP_ACTIVATION_STEP_KEY,
            sentAt: new Date('2026-05-20T10:00:00.000Z'),
            roleTrack: 'director',
            paymentState: 'unpaid',
            campaignKey: 'push_onboarding_activation_director',
          },
        ],
      },
    ];

    const report = summarizePushDripStates(states, now, 7);

    expect(report.totals.enrolledCount).toBe(3);
    expect(report.totals.activeCount).toBe(2);
    expect(report.totals.pausedCount).toBe(1);
    expect(report.totals.completedCount).toBe(1);
    expect(report.totals.dueNowCount).toBe(1);
    expect(report.totals.sentCount).toBe(3);
    expect(report.totals.sentInWindowCount).toBe(2);
    expect(report.currentStepBreakdown.activation_nudge).toBe(1);
    expect(report.currentStepBreakdown.reengagement_nudge).toBe(2);
    expect(report.roleTrackBreakdown.athlete).toBe(1);
    expect(report.roleTrackBreakdown.coach).toBe(1);
    expect(report.roleTrackBreakdown.director).toBe(1);
    expect(report.suppressionReasonBreakdown['quiet-hours']).toBe(1);
    expect(report.suppressionReasonBreakdown.completed).toBe(1);
    expect(report.recentSendBreakdown.byStep.welcome_nudge).toBe(1);
    expect(report.recentSendBreakdown.byStep.activation_nudge).toBe(1);
  });
});
