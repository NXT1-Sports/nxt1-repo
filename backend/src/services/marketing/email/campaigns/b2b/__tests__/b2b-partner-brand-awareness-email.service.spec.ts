import { describe, expect, it } from 'vitest';

import { buildB2BPartnerBrandAwarenessEmail } from '../b2b-partner-brand-awareness-email.service.js';
import {
  createB2BPartnerCampaignState,
  markB2BPartnerCampaignSent,
  selectB2BPartnerCampaignRecipients,
  summarizeB2BPartnerCampaignState,
} from '../b2b-partner-brand-awareness-state.js';
import type { B2BPartnerCampaignStateEntry } from '../b2b-partner-brand-awareness-state.js';

describe('buildB2BPartnerBrandAwarenessEmail', () => {
  it('builds the initial invitation variant with organization personalization', () => {
    const preview = buildB2BPartnerBrandAwarenessEmail({
      firstName: 'David',
      organization: 'Centennial High School',
      sequenceStep: 'initial',
    });

    expect(preview.campaignKey).toBe('b2b_partner_program_invite_initial');
    expect(preview.subject).toBe('An Invite For Centennial High School');
    expect(preview.html).toContain('Hi David,');
    expect(preview.html).toContain('Centennial High School');
    expect(preview.html).toContain('Book a Private Demo');
    expect(preview.html).toContain(
      'https://calendar.app.google/mgHK63hDovxiF1uR6?utm_source=email&utm_medium=outbound&utm_campaign=b2b_partner_program_invite_initial&utm_content=book_demo&utm_term=initial'
    );
    expect(preview.html).toContain(
      'https://nxt1sports.com/?utm_source=email&utm_medium=outbound&utm_campaign=b2b_partner_program_invite_initial&utm_content=visit_site&utm_term=initial'
    );
    expect(preview.html).toContain('An Invite For Your Team');
  });

  it('builds the follow-up variant', () => {
    const preview = buildB2BPartnerBrandAwarenessEmail({
      firstName: 'David',
      organization: 'Centennial High School',
      sequenceStep: 'follow_up',
    });

    expect(preview.campaignKey).toBe('b2b_partner_program_invite_follow_up');
    expect(preview.subject).toBe('Foundation 50 Access + Free $100 Budget (Limited)');
    expect(preview.html).toContain(
      'NXT1 gives coaches an AI agent staff that gives real time back every week.'
    );
    expect(preview.html).toContain(
      'Social proof is clear: coaches and program leaders already using NXT1 report the same result'
    );
    expect(preview.html).toContain('utm_campaign=b2b_partner_program_invite_follow_up');
    expect(preview.html).toContain('utm_content=book_demo');
    expect(preview.html).toContain('utm_content=visit_site');
    expect(preview.html).toContain('utm_term=follow_up');
  });

  it('builds the final follow-up variant', () => {
    const preview = buildB2BPartnerBrandAwarenessEmail({
      firstName: 'David',
      organization: 'Centennial High School',
      sequenceStep: 'final_follow_up',
    });

    expect(preview.campaignKey).toBe('b2b_partner_program_invite_final_follow_up');
    expect(preview.subject).toBe('Final Note: Last Chance for Foundation 50 + Free $100');
    expect(preview.html).toContain(
      'Final note for Centennial High School before we close this out.'
    );
    expect(preview.html).toContain('first platform built as an AI agent staff for sports programs');
    expect(preview.html).toContain('utm_campaign=b2b_partner_program_invite_final_follow_up');
    expect(preview.html).toContain('utm_content=book_demo');
    expect(preview.html).toContain('utm_term=final_follow_up');
  });
});

describe('b2b partner campaign state', () => {
  it('creates an initial queue summary and advances a recipient after send', () => {
    const now = new Date('2026-05-26T15:00:00.000Z');
    const state = createB2BPartnerCampaignState(
      [
        {
          organization: 'Centennial High School',
          crmStage: 'Lead',
          partnerType: 'School/University',
          primaryContact: 'David Carrillo',
          email: 'dcarrillo1@lcps.net',
          sendCount: 0,
          sequenceStep: 'initial',
          deliveryStatus: 'not_sent',
          lastSentAt: null,
          nextFollowUpAt: null,
          notes: 'Test contact.',
        },
      ],
      now
    );

    expect(summarizeB2BPartnerCampaignState(state, now)).toEqual({
      total: 1,
      notSent: 1,
      sent: 0,
      followUpDue: 0,
      followUpSent: 0,
      replied: 0,
      paused: 0,
      initialQueue: 1,
      followUpQueue: 0,
      finalFollowUpQueue: 0,
      byPartnerType: {
        'School/University': 1,
      },
    });

    const [recipient] = selectB2BPartnerCampaignRecipients(state, 'initial', now);
    const nextRecipient = markB2BPartnerCampaignSent(
      recipient as B2BPartnerCampaignStateEntry,
      {
        sequenceStep: 'initial',
        sentAt: now.toISOString(),
        campaignKey: 'b2b_partner_program_invite_initial',
        subject: 'An Invite For Centennial High School',
        provider: 'platform_smtp',
      },
      now
    );

    expect(nextRecipient.sendCount).toBe(1);
    expect(nextRecipient.deliveryStatus).toBe('sent');
    expect(nextRecipient.sequenceStep).toBe('follow_up');
    expect(nextRecipient.nextFollowUpAt).toBe('2026-05-31T15:00:00.000Z');
    expect(nextRecipient.history).toHaveLength(1);
  });
});
