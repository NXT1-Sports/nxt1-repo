import { describe, expect, it } from 'vitest';
import {
  buildInvestorsPartnershipsEmail,
  type InvestorsPartnershipsSequenceStep,
} from '../investors-partnerships-email.service.js';

function assertUtmParams(
  html: string,
  expected: {
    readonly campaignKey: string;
    readonly term: InvestorsPartnershipsSequenceStep;
  }
): void {
  expect(html).toContain('utm_source=email');
  expect(html).toContain('utm_medium=outbound');
  expect(html).toContain(`utm_campaign=${expected.campaignKey}`);
  expect(html).toContain(`utm_term=${expected.term}`);
}

describe('buildInvestorsPartnershipsEmail', () => {
  it('builds initial outreach variant with personalization and UTM links', () => {
    const result = buildInvestorsPartnershipsEmail({
      firstName: 'Maya',
      organization: 'Ridgeview Capital',
      sequenceStep: 'initial',
    });

    expect(result.sequenceStep).toBe('initial');
    expect(result.campaignKey).toBe('investors_partnerships_outreach_initial');
    expect(result.subject).toBe('A Partnership Opportunity For Ridgeview Capital');
    expect(result.html).toContain('Hello Maya,');
    expect(result.html).toContain('Ridgeview Capital');
    expect(result.html).toContain('new frontier');

    assertUtmParams(result.html, {
      campaignKey: result.campaignKey,
      term: 'initial',
    });
  });

  it('uses a simple first-name greeting when the contact name is incomplete', () => {
    const result = buildInvestorsPartnershipsEmail({
      firstName: 'Coach David',
      organization: 'Centennial High School',
      sequenceStep: 'initial',
    });

    expect(result.html).toContain('Hello David,');
    expect(result.html).not.toContain('Hello Coach David,');
  });

  it('builds follow up variant with plain HTML body and tracking links', () => {
    const result = buildInvestorsPartnershipsEmail({
      firstName: 'Jordan',
      organization: 'Bridge Sports Ventures',
      sequenceStep: 'follow_up',
    });

    expect(result.sequenceStep).toBe('follow_up');
    expect(result.campaignKey).toBe('investors_partnerships_outreach_follow_up');
    expect(result.subject).toBe('Quick Follow Up For Bridge Sports Ventures');
    expect(result.html).toContain('Quick follow up for');
    expect(result.html).toContain('Bridge Sports Ventures');

    assertUtmParams(result.html, {
      campaignKey: result.campaignKey,
      term: 'follow_up',
    });
  });

  it('builds final follow up variant with fallback greeting', () => {
    const result = buildInvestorsPartnershipsEmail({
      sequenceStep: 'final_follow_up',
    });

    expect(result.sequenceStep).toBe('final_follow_up');
    expect(result.campaignKey).toBe('investors_partnerships_outreach_final_follow_up');
    expect(result.subject).toBe('Final Note For your organization');
    expect(result.html).toContain('Hello,');
    expect(result.html).toContain('final note');

    assertUtmParams(result.html, {
      campaignKey: result.campaignKey,
      term: 'final_follow_up',
    });
  });

  it('uses different subject lines for investor vs partner audiences', () => {
    const investor = buildInvestorsPartnershipsEmail({
      organization: 'Northstar Capital',
      sequenceStep: 'initial',
      audience: 'investor',
    });

    const partner = buildInvestorsPartnershipsEmail({
      organization: 'Prime Distribution Group',
      sequenceStep: 'initial',
      audience: 'partner',
    });

    expect(investor.subject).toBe(
      'A Built National Scale Sports AI Agent Platform Ready For Investment'
    );
    expect(partner.subject).toBe('A Partnership Opportunity For Prime Distribution Group');
    expect(investor.subject).not.toEqual(partner.subject);
    expect(partner.html).toContain('24/7 digital sports staff');
    expect(partner.html).toContain(
      'Our already built 2026 AI Native Agent platform is ready to integrate with a company like Prime Distribution Group'
    );
    expect(partner.html).toContain(
      'turns sports organizations from staff-limited into agent-powered'
    );
    expect(partner.html).toContain(
      'AI Coordinators run real work across strategy, performance, video analysis, recruiting, communications, content, and operations'
    );
    expect(partner.html).toContain(
      'It gives teams a 24/7 digital sports staff that can make your platform more indispensable'
    );
    expect(partner.html).toContain(
      'stronger integrations, better workflow outcomes, and a more valuable platform experience your customers can feel immediately'
    );
    expect(partner.html).not.toContain('opening a limited strategic partner process');
    expect(investor.html).toContain(
      'AI Coordinators run real work across strategy, performance, video analysis, recruiting, communications, content, and operations'
    );
    expect(investor.html).toContain('positioned to define this category in sports');
    expect(investor.html).not.toContain('private invite');
  });

  it('uses frontier execution messaging in partner follow up and final follow up emails', () => {
    const partnerFollowUp = buildInvestorsPartnershipsEmail({
      organization: 'Prime Distribution Group',
      sequenceStep: 'follow_up',
      audience: 'partner',
    });

    const partnerFinal = buildInvestorsPartnershipsEmail({
      organization: 'Prime Distribution Group',
      sequenceStep: 'final_follow_up',
      audience: 'partner',
    });

    expect(partnerFollowUp.html).toContain('24/7 digital sports staff');
    expect(partnerFollowUp.html).not.toContain('It executes the work for you');
    expect(partnerFinal.html).toContain('24/7 digital sports staff');
    expect(partnerFinal.html).toContain('carry real operational work in the background');
    expect(partnerFinal.html).toContain('partners can move early');
  });
});
