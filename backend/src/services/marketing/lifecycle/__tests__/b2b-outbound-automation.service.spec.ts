import { describe, expect, it } from 'vitest';

import { __b2bOutboundAutomationTestUtils } from '../b2b-outbound-automation.service.js';

describe('b2b-outbound-automation Notion sync guards', () => {
  it('prefers a bounced duplicate row over a stale lead row for the same email', () => {
    const lead = {
      docId: 'black-vanburen-k12-mo-us',
      pageId: 'page-lead',
      pageUrl: 'https://notion.so/page-lead',
      organization: 'Van Buren School District',
      primaryContact: 'Jacob Black',
      partnerType: 'School/University',
      sourceUrl: '',
      email: 'black@vanburen.k12.mo.us',
      status: 'lead',
      touchCount: 0,
      lastContactedAt: null,
      nextFollowUpAt: null,
    } as const;

    const bounced = {
      ...lead,
      pageId: 'page-bounced',
      pageUrl: 'https://notion.so/page-bounced',
      status: 'bounced',
      touchCount: 1,
      lastContactedAt: '2026-07-20T12:01:57.059Z',
    } as const;

    const merged = __b2bOutboundAutomationTestUtils.mergeNotionLeadSyncCandidate(lead, bounced);

    expect(merged.pageId).toBe('page-bounced');
    expect(merged.status).toBe('bounced');
    expect(merged.touchCount).toBe(1);
    expect(merged.lastContactedAt).toBe('2026-07-20T12:01:57.059Z');
    expect(merged.nextFollowUpAt).toBeNull();
  });

  it('does not allow a lower-priority Notion state to overwrite an existing bounced lead', () => {
    expect(
      __b2bOutboundAutomationTestUtils.shouldPreferIncomingLeadStatus('bounced', 'contacted')
    ).toBe(false);
    expect(
      __b2bOutboundAutomationTestUtils.shouldPreferIncomingLeadStatus('lead', 'contacted')
    ).toBe(true);
  });

  it('treats stale lead records at the automation limit as eligible for phone call due reconciliation', () => {
    expect(
      __b2bOutboundAutomationTestUtils.isEligibleForPhoneCallDueReconciliation({
        id: 'cvance-cypressranchmustangsfb-org',
        email: 'cvance@cypressranchmustangsfb.org',
        organization: 'Cypress Ranch Mustangs',
        partnerType: 'School/University',
        primaryContact: 'Coach Cole Vance',
        sourceUrl: '',
        status: 'lead',
        touchCount: 3,
        lastContactedAt: null,
        nextFollowUpAt: null,
        replied: false,
        paused: false,
      })
    ).toBe(true);
  });

  it('maps Phone Call Due stage to follow_up_due when touches remain and follow-up is due', () => {
    expect(
      __b2bOutboundAutomationTestUtils.toLeadStatusFromNotionStage(
        'Phone Call Due',
        '2026-08-01',
        1
      )
    ).toBe('follow_up_due');

    expect(
      __b2bOutboundAutomationTestUtils.toLeadStatusFromNotionStage('Phone Call Due', null, 3)
    ).toBe('phone_call_due');
  });
});
