import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  buildSignupDashboardNotionProperties,
  upsertB2BOutboundLead,
  upsertSignupDashboardEntry,
} from '../signup-dashboard-entry.service.js';

const ORIGINAL_ENV = { ...process.env };

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function notionPageWithStage(id: string, stage: string, url = `https://notion.so/${id}`) {
  return {
    id,
    url,
    properties: {
      Stage: { type: 'status', status: { name: stage } },
    },
  };
}

describe('signup dashboard Notion entry service', () => {
  const fetchMock = vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>();

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockReset();
    process.env = { ...ORIGINAL_ENV };
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    process.env = { ...ORIGINAL_ENV };
  });

  it('maps completed signup data into the B2B Partners Onboarding Completed properties', () => {
    const properties = buildSignupDashboardNotionProperties({
      userId: 'user-123',
      environment: 'production',
      role: 'athlete',
      firstName: 'Ava',
      lastName: 'Stone',
      email: 'ava@example.com',
      primarySport: 'Basketball',
      teamName: 'NXT Prep',
      teamId: 'team-1',
      organizationId: 'org-1',
      city: 'Austin',
      state: 'TX',
      referralId: 'ref-1',
      teamCode: 'ABC123',
      teamCodeName: 'Varsity Gold',
      profileUrl: 'https://nxt1sports.com/profile/user-123',
      completedAt: new Date('2026-05-26T12:00:00.000Z'),
    });

    expect(properties['Organization']).toEqual({
      title: [{ type: 'text', text: { content: 'NXT Prep' } }],
    });
    expect(properties['Stage']).toEqual({ status: { name: 'Onboarding Completed' } });
    expect(properties['Type']).toEqual({ select: { name: 'Other' } });
    expect(properties['Primary Contact']).toEqual({
      rich_text: [{ type: 'text', text: { content: 'Ava Stone' } }],
    });
    expect(properties['Email']).toEqual({ email: 'ava@example.com' });
    expect(properties['Lead Source']).toEqual({ select: { name: 'Referral' } });
    expect(properties['Times Contacted']).toEqual({ number: 0 });
    expect(properties['Next Action']).toEqual({
      rich_text: [
        { type: 'text', text: { content: 'Review signup and qualify follow-up opportunity.' } },
      ],
    });
    const notes = (properties['Notes'] as { rich_text: readonly [{ text: { content: string } }] })
      .rich_text[0].text.content;
    expect(notes).toContain('NXT1 User ID: user-123');
    expect(notes).toContain('Role: athlete');
    expect(notes).toContain('Environment: production');
    expect(notes).toContain('Primary Sport: Basketball');
    expect(notes).toContain('Team ID: team-1');
    expect(notes).toContain('Organization ID: org-1');
    expect(notes).toContain('Location: Austin, TX');
    expect(notes).toContain('Referral ID: ref-1');
    expect(notes).toContain('Team Code: ABC123 (Varsity Gold)');
    expect(notes).toContain('NXT1 Profile: https://nxt1sports.com/profile/user-123');
  });

  it('maps onboarding social referral selections to the Content lead source', () => {
    const properties = buildSignupDashboardNotionProperties({
      userId: 'user-social',
      environment: 'production',
      role: 'coach',
      email: 'social@example.com',
      referralSource: 'social',
    });

    expect(properties['Lead Source']).toEqual({ select: { name: 'Content' } });
  });

  it('maps onboarding search referral selections to the Inbound lead source', () => {
    const properties = buildSignupDashboardNotionProperties({
      userId: 'user-search',
      environment: 'production',
      role: 'coach',
      email: 'search@example.com',
      referralSource: 'search',
    });

    expect(properties['Lead Source']).toEqual({ select: { name: 'Inbound' } });
  });

  it('uses onboarding other-specify text to detect outbound lead sources', () => {
    const properties = buildSignupDashboardNotionProperties({
      userId: 'user-outbound',
      environment: 'production',
      role: 'coach',
      email: 'outbound@example.com',
      referralSource: 'other',
      referralOtherSpecify: 'Cold email outreach from the NXT1 team',
    });

    expect(properties['Lead Source']).toEqual({ select: { name: 'Outbound' } });
    expect(properties['Referral Details']).toEqual({
      rich_text: [
        { type: 'text', text: { content: 'Other: Cold email outreach from the NXT1 team' } },
      ],
    });
  });

  it('skips without calling Notion when the signup dashboard integration is disabled', async () => {
    process.env['NOTION_SIGNUP_DASHBOARD_ENABLED'] = 'false';

    const result = await upsertSignupDashboardEntry({
      userId: 'user-disabled',
      environment: 'staging',
      role: 'coach',
    });

    expect(result).toEqual({ status: 'skipped', reason: 'disabled' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('reuses an existing B2B Partners page by email before creating a duplicate', async () => {
    process.env['NOTION_SIGNUP_DASHBOARD_ENABLED'] = 'true';
    process.env['NOTION_API_TOKEN'] = 'secret-test';
    process.env['NOTION_SIGNUP_DASHBOARD_DATABASE_ID'] = 'database-1';
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ results: [{ id: 'page-existing', url: 'https://notion.so/existing' }] })
    );
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ id: 'page-existing', url: 'https://notion.so/existing' })
    );
    fetchMock.mockResolvedValueOnce(
      jsonResponse(
        notionPageWithStage('page-existing', 'Onboarding Completed', 'https://notion.so/existing')
      )
    );

    const result = await upsertSignupDashboardEntry({
      userId: 'user-existing',
      environment: 'production',
      role: 'athlete',
      email: 'existing@example.com',
    });

    expect(result).toEqual({
      status: 'existing',
      pageId: 'page-existing',
      pageUrl: 'https://notion.so/existing',
    });
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain('/databases/database-1/query');
  });

  it('creates an Onboarding Completed row when no B2B Partners page exists for the signup email', async () => {
    process.env['NOTION_SIGNUP_DASHBOARD_ENABLED'] = 'true';
    process.env['NOTION_API_TOKEN'] = 'secret-test';
    process.env['NOTION_SIGNUP_DASHBOARD_DATABASE_ID'] = 'database-1';
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ results: [] }))
      .mockResolvedValueOnce(jsonResponse({ results: [] }))
      .mockResolvedValueOnce(jsonResponse({ id: 'page-created', url: 'https://notion.so/created' }))
      .mockResolvedValueOnce(
        jsonResponse(
          notionPageWithStage('page-created', 'Onboarding Completed', 'https://notion.so/created')
        )
      );

    const result = await upsertSignupDashboardEntry({
      userId: 'user-new',
      environment: 'production',
      role: 'coach',
      firstName: 'Jordan',
      lastName: 'Reed',
      email: 'jordan@example.com',
    });

    const createCall = fetchMock.mock.calls.find(([, init]) => {
      return (
        init?.method === 'POST' &&
        typeof init?.body === 'string' &&
        String(init.body).includes('"parent"')
      );
    });

    const createBody = JSON.parse(String(createCall?.[1]?.body)) as {
      readonly parent: { readonly database_id: string };
      readonly properties: Record<string, unknown>;
    };

    expect(result).toEqual({
      status: 'created',
      pageId: 'page-created',
      pageUrl: 'https://notion.so/created',
    });
    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(createBody.parent.database_id).toBe('database-1');
    expect(createBody.properties['Organization']).toEqual({
      title: [{ type: 'text', text: { content: 'Jordan Reed' } }],
    });
    expect(createBody.properties['Stage']).toEqual({ status: { name: 'Onboarding Completed' } });
    expect(createBody.properties['Type']).toEqual({ select: { name: 'Other' } });
    expect(createBody.properties['Email']).toEqual({ email: 'jordan@example.com' });
  });

  it('reuses an existing B2B Partners page when the organization matches a normalized school variant', async () => {
    process.env['NOTION_SIGNUP_DASHBOARD_ENABLED'] = 'true';
    process.env['NOTION_API_TOKEN'] = 'secret-test';
    process.env['NOTION_SIGNUP_DASHBOARD_DATABASE_ID'] = 'database-1';
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ results: [] }))
      .mockResolvedValueOnce(jsonResponse({ results: [] }))
      .mockResolvedValueOnce(
        jsonResponse({ results: [{ id: 'page-existing', url: 'https://notion.so/existing' }] })
      )
      .mockResolvedValueOnce(
        jsonResponse({ id: 'page-existing', url: 'https://notion.so/existing' })
      )
      .mockResolvedValueOnce(
        jsonResponse(
          notionPageWithStage('page-existing', 'Onboarding Completed', 'https://notion.so/existing')
        )
      );

    const result = await upsertSignupDashboardEntry({
      userId: 'user-school-variant',
      environment: 'production',
      role: 'coach',
      firstName: 'Taylor',
      lastName: 'Smith',
      email: 'taylor@example.com',
      teamName: 'Akron East',
      organizationType: 'high_school',
    });

    expect(result).toEqual({
      status: 'existing',
      pageId: 'page-existing',
      pageUrl: 'https://notion.so/existing',
    });
    expect(fetchMock).toHaveBeenCalledTimes(5);

    const organizationQueryBodies = fetchMock.mock.calls
      .map(([, init]) => (typeof init?.body === 'string' ? String(init.body) : null))
      .filter(
        (body): body is string => Boolean(body) && body.includes('"property":"Organization"')
      );

    expect(organizationQueryBodies).toHaveLength(2);
    expect(organizationQueryBodies[0]).toContain('"equals":"Akron East"');
    expect(organizationQueryBodies[1]).toContain('"equals":"Akron East High School"');
  });

  it('reuses an existing B2B Partners page when mascot naming differs via starts_with fallback', async () => {
    process.env['NOTION_SIGNUP_DASHBOARD_ENABLED'] = 'true';
    process.env['NOTION_API_TOKEN'] = 'secret-test';
    process.env['NOTION_SIGNUP_DASHBOARD_DATABASE_ID'] = 'database-1';
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ results: [] }))
      .mockResolvedValueOnce(jsonResponse({ results: [] }))
      .mockResolvedValueOnce(jsonResponse({ results: [] }))
      .mockResolvedValueOnce(jsonResponse({ results: [] }))
      .mockResolvedValueOnce(jsonResponse({ results: [] }))
      .mockResolvedValueOnce(
        jsonResponse({ results: [{ id: 'page-mascot', url: 'https://notion.so/mascot' }] })
      )
      .mockResolvedValueOnce(jsonResponse({ id: 'page-mascot', url: 'https://notion.so/mascot' }))
      .mockResolvedValueOnce(
        jsonResponse(
          notionPageWithStage('page-mascot', 'Onboarding Completed', 'https://notion.so/mascot')
        )
      );

    const result = await upsertSignupDashboardEntry({
      userId: 'user-mascot-variant',
      environment: 'production',
      role: 'coach',
      firstName: 'Taylor',
      lastName: 'Smith',
      email: 'mascot@example.com',
      teamName: 'Akron East Dragons',
      organizationType: 'high_school',
    });

    expect(result).toEqual({
      status: 'existing',
      pageId: 'page-mascot',
      pageUrl: 'https://notion.so/mascot',
    });
    expect(fetchMock).toHaveBeenCalledTimes(8);

    const startsWithQueryBodies = fetchMock.mock.calls
      .map(([, init]) => (typeof init?.body === 'string' ? String(init.body) : null))
      .filter((body): body is string => Boolean(body) && body.includes('"starts_with"'));

    expect(startsWithQueryBodies).toHaveLength(1);
    expect(startsWithQueryBodies[0]).toContain('"starts_with":"Akron East"');
  });

  it('reuses an existing B2B Partners page when sport suffix naming differs', async () => {
    process.env['NOTION_SIGNUP_DASHBOARD_ENABLED'] = 'true';
    process.env['NOTION_API_TOKEN'] = 'secret-test';
    process.env['NOTION_SIGNUP_DASHBOARD_DATABASE_ID'] = 'database-1';
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ results: [] }))
      .mockResolvedValueOnce(jsonResponse({ results: [] }))
      .mockResolvedValueOnce(
        jsonResponse({ results: [{ id: 'page-barberton', url: 'https://notion.so/barberton' }] })
      )
      .mockResolvedValueOnce(
        jsonResponse({ id: 'page-barberton', url: 'https://notion.so/barberton' })
      )
      .mockResolvedValueOnce(
        jsonResponse(
          notionPageWithStage(
            'page-barberton',
            'Onboarding Completed',
            'https://notion.so/barberton'
          )
        )
      );

    const result = await upsertSignupDashboardEntry({
      userId: 'user-sport-variant',
      environment: 'production',
      role: 'coach',
      firstName: 'Taylor',
      lastName: 'Smith',
      email: 'coach@barbertonfootball.example',
      teamName: 'Barberton Football',
    });

    expect(result).toEqual({
      status: 'existing',
      pageId: 'page-barberton',
      pageUrl: 'https://notion.so/barberton',
    });

    const organizationQueryBodies = fetchMock.mock.calls
      .map(([, init]) => (typeof init?.body === 'string' ? String(init.body) : null))
      .filter(
        (body): body is string => Boolean(body) && body.includes('"property":"Organization"')
      );

    expect(organizationQueryBodies[0]).toContain('"equals":"Barberton Football"');
    expect(organizationQueryBodies[1]).toContain('"equals":"Barberton"');
  });

  it('reuses an existing B2B Partners page when incoming base name matches existing sport suffix row', async () => {
    process.env['NOTION_SIGNUP_DASHBOARD_ENABLED'] = 'true';
    process.env['NOTION_API_TOKEN'] = 'secret-test';
    process.env['NOTION_SIGNUP_DASHBOARD_DATABASE_ID'] = 'database-1';
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ results: [] }))
      .mockResolvedValueOnce(jsonResponse({ results: [] }))
      .mockResolvedValueOnce(
        jsonResponse({ results: [{ id: 'page-barberton', url: 'https://notion.so/barberton' }] })
      )
      .mockResolvedValueOnce(
        jsonResponse({ id: 'page-barberton', url: 'https://notion.so/barberton' })
      )
      .mockResolvedValueOnce(
        jsonResponse(
          notionPageWithStage(
            'page-barberton',
            'Onboarding Completed',
            'https://notion.so/barberton'
          )
        )
      );

    const result = await upsertSignupDashboardEntry({
      userId: 'user-sport-base',
      environment: 'production',
      role: 'coach',
      firstName: 'Taylor',
      lastName: 'Smith',
      email: 'coach@barberton.example',
      teamName: 'Barberton',
    });

    expect(result).toEqual({
      status: 'existing',
      pageId: 'page-barberton',
      pageUrl: 'https://notion.so/barberton',
    });

    const startsWithQueryBodies = fetchMock.mock.calls
      .map(([, init]) => (typeof init?.body === 'string' ? String(init.body) : null))
      .filter((body): body is string => Boolean(body) && body.includes('"starts_with"'));

    expect(startsWithQueryBodies[0]).toContain('"starts_with":"Barberton"');
  });

  it('links the B2C user page into the B2B Members relation when available', async () => {
    process.env['NOTION_SIGNUP_DASHBOARD_ENABLED'] = 'true';
    process.env['NOTION_B2C_GROWTH_HUB_ENABLED'] = 'true';
    process.env['NOTION_API_TOKEN'] = 'secret-test';
    process.env['NOTION_SIGNUP_DASHBOARD_DATABASE_ID'] = 'database-b2b';
    process.env['NOTION_B2C_GROWTH_HUB_DATABASE_ID'] = 'database-b2c';

    fetchMock
      .mockResolvedValueOnce(jsonResponse({ results: [] }))
      .mockResolvedValueOnce(jsonResponse({ results: [] }))
      .mockResolvedValueOnce(jsonResponse({ id: 'page-b2b', url: 'https://notion.so/page-b2b' }))
      .mockResolvedValueOnce(
        jsonResponse(
          notionPageWithStage('page-b2b', 'Onboarding Completed', 'https://notion.so/page-b2b')
        )
      )
      .mockResolvedValueOnce(
        jsonResponse({ results: [{ id: 'page-b2c', url: 'https://notion.so/page-b2c' }] })
      )
      .mockResolvedValueOnce(
        jsonResponse({
          id: 'page-b2b',
          properties: {
            Members: { type: 'relation', relation: [] },
          },
        })
      )
      .mockResolvedValueOnce(jsonResponse({ id: 'page-b2b', url: 'https://notion.so/page-b2b' }));

    await upsertSignupDashboardEntry({
      userId: 'user-member-link',
      environment: 'production',
      role: 'coach',
      firstName: 'Jordan',
      lastName: 'Reed',
      email: 'jordan@example.com',
    });

    const relationPatchCall = fetchMock.mock.calls.find(([, init]) => {
      return (
        init?.method === 'PATCH' &&
        typeof init?.body === 'string' &&
        String(init.body).includes('"Members"') &&
        String(init.body).includes('page-b2c')
      );
    });

    expect(relationPatchCall).toBeTruthy();
  });

  it('writes the Phone Call Due stage for final outbound handoffs', async () => {
    process.env['NOTION_SIGNUP_DASHBOARD_ENABLED'] = 'true';
    process.env['NOTION_API_TOKEN'] = 'secret-test';
    process.env['NOTION_SIGNUP_DASHBOARD_DATABASE_ID'] = 'database-1';
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ results: [] }))
      .mockResolvedValueOnce(jsonResponse({ results: [] }))
      .mockResolvedValueOnce(jsonResponse({ results: [] }))
      .mockResolvedValueOnce(
        jsonResponse({ id: 'page-phone', url: 'https://notion.so/phone-call-due' })
      )
      .mockResolvedValueOnce(
        jsonResponse(
          notionPageWithStage('page-phone', 'Phone Call Due', 'https://notion.so/phone-call-due')
        )
      )
      .mockResolvedValueOnce(
        jsonResponse({
          id: 'page-phone',
          properties: {
            'Times Contacted': { type: 'number', number: 0 },
            'Last Contacted At': { type: 'date', date: null },
            'Next Follow-Up': { type: 'date', date: null },
          },
        })
      )
      .mockResolvedValueOnce(
        jsonResponse({ id: 'page-phone', url: 'https://notion.so/phone-call-due' })
      );

    const result = await upsertB2BOutboundLead({
      environment: 'production',
      organization: 'NXT1 Academy',
      email: 'coach@nxt1academy.com',
      stage: 'Phone Call Due',
      timesContacted: 3,
      lastContactedAt: new Date('2026-07-02T10:00:00.000Z'),
      nextFollowUpAt: null,
      nextAction: 'Automated follow-ups complete. Phone call due.',
    });

    const createCall = fetchMock.mock.calls.find(([, init]) => {
      return (
        init?.method === 'POST' &&
        typeof init?.body === 'string' &&
        String(init.body).includes('"parent"')
      );
    });
    const createBody = JSON.parse(String(createCall?.[1]?.body)) as {
      readonly properties: Record<string, unknown>;
    };

    expect(result).toEqual({
      status: 'created',
      pageId: 'page-phone',
      pageUrl: 'https://notion.so/phone-call-due',
    });
    expect(createBody.properties['Stage']).toEqual({ status: { name: 'Phone Call Due' } });
  });

  it('writes the Bounced stage for permanently failed B2B outbound leads', async () => {
    process.env['NOTION_SIGNUP_DASHBOARD_ENABLED'] = 'true';
    process.env['NOTION_API_TOKEN'] = 'secret-test';
    process.env['NOTION_SIGNUP_DASHBOARD_DATABASE_ID'] = 'database-1';
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ results: [] }))
      .mockResolvedValueOnce(jsonResponse({ results: [] }))
      .mockResolvedValueOnce(jsonResponse({ results: [] }))
      .mockResolvedValueOnce(
        jsonResponse({ id: 'page-bounced', url: 'https://notion.so/bounced-b2b' })
      )
      .mockResolvedValueOnce(
        jsonResponse(
          notionPageWithStage('page-bounced', 'Bounced', 'https://notion.so/bounced-b2b')
        )
      )
      .mockResolvedValueOnce(
        jsonResponse({
          id: 'page-bounced',
          properties: {
            'Times Contacted': { type: 'number', number: 0 },
            'Last Contacted At': { type: 'date', date: null },
            'Next Follow-Up': { type: 'date', date: null },
          },
        })
      )
      .mockResolvedValueOnce(
        jsonResponse({ id: 'page-bounced', url: 'https://notion.so/bounced-b2b' })
      );

    const result = await upsertB2BOutboundLead({
      environment: 'production',
      organization: 'NXT1 Academy',
      email: 'bounce@nxt1academy.com',
      stage: 'Bounced',
      timesContacted: 1,
      lastContactedAt: new Date('2026-07-02T10:00:00.000Z'),
      nextFollowUpAt: null,
    });

    const createCall = fetchMock.mock.calls.find(([, init]) => {
      return (
        init?.method === 'POST' &&
        typeof init?.body === 'string' &&
        String(init.body).includes('"parent"')
      );
    });
    const createBody = JSON.parse(String(createCall?.[1]?.body)) as {
      readonly properties: Record<string, unknown>;
    };

    expect(result).toEqual({
      status: 'created',
      pageId: 'page-bounced',
      pageUrl: 'https://notion.so/bounced-b2b',
    });
    expect(createBody.properties['Stage']).toEqual({ status: { name: 'Bounced' } });
  });

  it('uses a known B2B page id before falling back to email lookup', async () => {
    process.env['NOTION_SIGNUP_DASHBOARD_ENABLED'] = 'true';
    process.env['NOTION_API_TOKEN'] = 'secret-test';
    process.env['NOTION_SIGNUP_DASHBOARD_DATABASE_ID'] = 'database-1';
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse({ id: 'page-known', url: 'https://notion.so/page-known' })
      )
      .mockResolvedValueOnce(
        jsonResponse(notionPageWithStage('page-known', 'Bounced', 'https://notion.so/page-known'))
      )
      .mockResolvedValueOnce(
        jsonResponse({
          id: 'page-known',
          properties: {
            'Times Contacted': { type: 'number', number: 1 },
            'Last Contacted At': { type: 'date', date: null },
            'Next Follow-Up': { type: 'date', date: null },
          },
        })
      )
      .mockResolvedValueOnce(
        jsonResponse({ id: 'page-known', url: 'https://notion.so/page-known' })
      );

    const result = await upsertB2BOutboundLead({
      environment: 'production',
      organization: 'Van Buren School District',
      pageId: 'page-known',
      email: 'black@vanburen.k12.mo.us',
      stage: 'Bounced',
      timesContacted: 1,
      lastContactedAt: new Date('2026-07-20T12:01:57.059Z'),
      nextFollowUpAt: null,
    });

    expect(result).toEqual({
      status: 'existing',
      pageId: 'page-known',
      pageUrl: 'https://notion.so/page-known',
    });

    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(
      fetchMock.mock.calls.some(
        ([, init]) =>
          typeof init?.body === 'string' && String(init.body).includes('"email":{"equals"')
      )
    ).toBe(false);
  });
});
