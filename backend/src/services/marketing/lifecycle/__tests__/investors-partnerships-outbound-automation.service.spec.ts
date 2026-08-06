import { describe, expect, it } from 'vitest';

import { __investorsPartnershipsOutboundAutomationTestUtils } from '../investors-partnerships-outbound-automation.service.js';

describe('investors-partnerships-outbound-automation Notion sync guards', () => {
  it('prefers a bounced duplicate row over a stale lead row for the same email', () => {
    const lead = {
      docId: 'partnerships-kitmanlabs-com',
      pageId: 'page-lead',
      pageUrl: 'https://notion.so/page-lead',
      organization: 'Kitman Labs',
      primaryContact: 'Mark Duda (CEO & Co-Founder)',
      leadType: 'Integration Partner',
      sourceUrl: '',
      email: 'partnerships@kitmanlabs.com',
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
      lastContactedAt: '2026-07-22T12:02:00.000Z',
    } as const;

    const merged = __investorsPartnershipsOutboundAutomationTestUtils.mergeNotionLeadSyncCandidate(
      lead,
      bounced
    );

    expect(merged.pageId).toBe('page-bounced');
    expect(merged.status).toBe('bounced');
    expect(merged.touchCount).toBe(1);
    expect(merged.lastContactedAt).toBe('2026-07-22T12:02:00.000Z');
    expect(merged.nextFollowUpAt).toBeNull();
  });

  it('does not allow a lower-priority Notion state to overwrite an existing bounced lead', () => {
    expect(
      __investorsPartnershipsOutboundAutomationTestUtils.shouldPreferIncomingLeadStatus(
        'bounced',
        'contacted'
      )
    ).toBe(false);
    expect(
      __investorsPartnershipsOutboundAutomationTestUtils.shouldPreferIncomingLeadStatus(
        'lead',
        'contacted'
      )
    ).toBe(true);
  });

  it('maps Phone Call Due stage to follow_up_due when touches remain and follow-up is due', () => {
    expect(
      __investorsPartnershipsOutboundAutomationTestUtils.toLeadStatusFromNotionStage(
        'Phone Call Due',
        '2026-08-01',
        1
      )
    ).toBe('follow_up_due');

    expect(
      __investorsPartnershipsOutboundAutomationTestUtils.toLeadStatusFromNotionStage(
        'Phone Call Due',
        null,
        3
      )
    ).toBe('phone_call_due');
  });
});
