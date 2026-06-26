import { describe, expect, it } from 'vitest';

import {
  AGENT_X_COMPLEX_HOLD_COST_CENTS,
  AGENT_X_STANDARD_HOLD_COST_CENTS,
  estimateAgentXBillingGateCostCents,
} from '../billing-gate-estimator.service.js';

describe('estimateAgentXBillingGateCostCents', () => {
  it('keeps the standard hold floor at or above 40 cents', () => {
    expect(AGENT_X_STANDARD_HOLD_COST_CENTS).toBeGreaterThanOrEqual(40);
    expect(AGENT_X_COMPLEX_HOLD_COST_CENTS).toBeGreaterThanOrEqual(
      AGENT_X_STANDARD_HOLD_COST_CENTS
    );
  });

  it('uses the complex hold for media generation intents', () => {
    expect(
      estimateAgentXBillingGateCostCents({
        text: 'create highlight reel from film and build a poster graphic',
      })
    ).toBe(AGENT_X_COMPLEX_HOLD_COST_CENTS);
  });

  it('uses the complex hold for platform workflow prompts', () => {
    expect(
      estimateAgentXBillingGateCostCents({
        text: 'practice-script scout-opponent-tendencies summarize-selection',
      })
    ).toBe(AGENT_X_COMPLEX_HOLD_COST_CENTS);
  });

  it('uses the complex hold for playbook panel prompts', () => {
    expect(
      estimateAgentXBillingGateCostCents({
        text: 'gameday-playbook install-plan coaching-points create-scout-team-playbook practice-scripts variations opening-script tempo-packages trick-play-ideas',
      })
    ).toBe(AGENT_X_COMPLEX_HOLD_COST_CENTS);
  });

  it('uses the complex hold for highlight graphics and creative packaging prompts', () => {
    expect(
      estimateAgentXBillingGateCostCents({
        text: 'create weekly highlight graphics and build a caption pack with branded creative',
      })
    ).toBe(AGENT_X_COMPLEX_HOLD_COST_CENTS);
  });

  it('uses the complex hold for attachment-heavy analysis requests', () => {
    expect(
      estimateAgentXBillingGateCostCents({
        text: 'summarize these files and extract key details for the staff',
        hasAttachment: true,
      })
    ).toBe(AGENT_X_COMPLEX_HOLD_COST_CENTS);
  });

  it('uses the complex hold for attachment-heavy film and document review even with lighter wording', () => {
    expect(
      estimateAgentXBillingGateCostCents({
        text: 'review the attached playbooks, reports, and cutups',
        hasAttachment: true,
      })
    ).toBe(AGENT_X_COMPLEX_HOLD_COST_CENTS);
  });

  it('keeps lightweight requests on the standard hold', () => {
    expect(
      estimateAgentXBillingGateCostCents({
        text: 'help me draft a quick reply to this parent message',
      })
    ).toBe(AGENT_X_STANDARD_HOLD_COST_CENTS);
  });
});
