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

  it('lets an overdue follow-up Notion state repair a stale follow_up_sent record', () => {
    expect(
      __b2bOutboundAutomationTestUtils.shouldPreferIncomingLeadStatus(
        'follow_up_sent',
        'follow_up_due'
      )
    ).toBe(true);
    expect(
      __b2bOutboundAutomationTestUtils.shouldPreferIncomingLeadStatus(
        'follow_up_sent',
        'phone_call_due'
      )
    ).toBe(true);
  });

  it('lets an active Notion state reopen a stale phone_call_due lead below the automation limit', () => {
    expect(
      __b2bOutboundAutomationTestUtils.shouldPreferIncomingLeadStatus(
        'phone_call_due',
        'follow_up_due',
        1
      )
    ).toBe(true);
    expect(
      __b2bOutboundAutomationTestUtils.shouldPreferIncomingLeadStatus(
        'phone_call_due',
        'contacted',
        2
      )
    ).toBe(true);
    expect(
      __b2bOutboundAutomationTestUtils.shouldPreferIncomingLeadStatus(
        'phone_call_due',
        'follow_up_due',
        3
      )
    ).toBe(false);
  });

  it('keeps an intentional Notion phone_call_due row terminal even below the automation limit', () => {
    const contacted = {
      docId: 'coach-example-school-org',
      pageId: 'page-contacted',
      pageUrl: 'https://notion.so/page-contacted',
      organization: 'Example School',
      primaryContact: 'Coach Example',
      partnerType: 'School/University',
      sourceUrl: '',
      email: 'coach@example-school.org',
      status: 'contacted',
      touchCount: 1,
      lastContactedAt: '2026-07-31T12:00:00.000Z',
      nextFollowUpAt: '2026-08-07',
    } as const;

    const phoneCallDue = {
      ...contacted,
      pageId: 'page-phone',
      pageUrl: 'https://notion.so/page-phone',
      status: 'phone_call_due',
      nextFollowUpAt: null,
    } as const;

    const merged = __b2bOutboundAutomationTestUtils.mergeNotionLeadSyncCandidate(
      contacted,
      phoneCallDue
    );

    expect(merged.pageId).toBe('page-phone');
    expect(merged.status).toBe('phone_call_due');
    expect(merged.nextFollowUpAt).toBeNull();
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
});
