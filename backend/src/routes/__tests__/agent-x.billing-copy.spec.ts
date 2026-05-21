import { describe, expect, it } from 'vitest';
import { buildOrganizationBudgetFollowUpCopy } from '../agent/billing-copy.js';

describe('buildOrganizationBudgetFollowUpCopy', () => {
  it('returns director/admin copy for org budget limits', () => {
    expect(buildOrganizationBudgetFollowUpCopy('director')).toBe(
      'You can update the organization budget in Settings → Usage to continue.'
    );
    expect(buildOrganizationBudgetFollowUpCopy('admin')).toBe(
      'You can update the organization budget in Settings → Usage to continue.'
    );
  });

  it('returns coach-specific copy for org budget limits', () => {
    expect(buildOrganizationBudgetFollowUpCopy('coach')).toBe(
      'Ask your athletic director to raise the organization budget in Settings → Usage.'
    );
  });

  it('returns athlete/default copy for org budget limits', () => {
    expect(buildOrganizationBudgetFollowUpCopy('athlete')).toBe(
      'Ask your coach or athletic director to raise the organization budget in Settings → Usage.'
    );
    expect(buildOrganizationBudgetFollowUpCopy()).toBe(
      'Ask your coach or athletic director to raise the organization budget in Settings → Usage.'
    );
  });
});
