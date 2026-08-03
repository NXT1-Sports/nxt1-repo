import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { buildB2CUsersNotionProperties, upsertB2CUsersEntry } from '../b2c-users-entry.service.js';

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

describe('B2C Users Notion entry service', () => {
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

  it('maps athlete lifecycle data into the B2C Growth Hub schema', () => {
    const recentLastActiveAt = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);

    const properties = buildB2CUsersNotionProperties({
      userId: 'athlete-1',
      environment: 'production',
      firstName: 'Ava',
      lastName: 'Stone',
      email: 'ava@example.com',
      primarySport: 'Track and Field',
      state: 'TX',
      referralSource: 'instagram',
      signUpDate: new Date('2026-05-26T12:00:00.000Z'),
      lastActiveAt: recentLastActiveAt,
      stage: 'Usage Started',
      ltvDollars: 49,
      usageRevenueMonthlyDollars: 29,
    });

    expect(properties['Name']).toEqual({
      title: [{ type: 'text', text: { content: 'Ava Stone' } }],
    });
    expect(properties['Email']).toEqual({ email: 'ava@example.com' });
    expect(properties['Stage']).toEqual({ status: { name: 'Usage Started' } });
    expect(properties['Engagement']).toEqual({ select: { name: 'Medium' } });
    expect(properties['Sport']).toEqual({ select: { name: 'Track & Field' } });
    expect(properties['State']).toEqual({
      rich_text: [{ type: 'text', text: { content: 'TX' } }],
    });
    expect(properties['Referral Source']).toEqual({ select: { name: 'Social Media' } });
    expect(properties['LTV']).toEqual({ number: 49 });
    expect(properties['Usage Revenue ($/mo)']).toEqual({ number: 29 });
  });

  it('maps partner referrals to the Partner Program source', () => {
    const properties = buildB2CUsersNotionProperties({
      userId: 'athlete-partner',
      environment: 'production',
      firstName: 'Maya',
      lastName: 'Hill',
      email: 'maya@example.com',
      referralClubName: 'Akron East',
      referralSource: 'club',
      stage: 'Account Started',
    });

    expect(properties['Referral Source']).toEqual({ select: { name: 'Partner Program' } });
  });

  it('maps onboarding completion to the Onboarding Completed stage', () => {
    const properties = buildB2CUsersNotionProperties({
      userId: 'athlete-completed',
      environment: 'production',
      email: 'completed@example.com',
      stage: 'Onboarding Completed',
    });

    expect(properties['Stage']).toEqual({ status: { name: 'Onboarding Completed' } });
  });

  it('marks stale B2C users as At Risk engagement', () => {
    const properties = buildB2CUsersNotionProperties({
      userId: 'athlete-risk',
      environment: 'production',
      firstName: 'Riley',
      lastName: 'Lane',
      email: 'riley@example.com',
      primarySport: 'Football',
      stage: 'Closed Won',
      lastActiveAt: '2026-05-01T00:00:00.000Z',
    });

    expect(properties['Engagement']).toEqual({ select: { name: 'At Risk' } });
  });

  it('skips without calling Notion when the B2C Growth Hub integration is disabled', async () => {
    process.env['NOTION_B2C_GROWTH_HUB_ENABLED'] = 'false';

    const result = await upsertB2CUsersEntry({
      userId: 'athlete-disabled',
      environment: 'production',
      email: 'disabled@example.com',
      stage: 'Account Started',
    });

    expect(result).toEqual({ status: 'skipped', reason: 'disabled' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('reuses an existing B2C page by email before creating a duplicate', async () => {
    process.env['NOTION_B2C_GROWTH_HUB_ENABLED'] = 'true';
    process.env['NOTION_API_TOKEN'] = 'secret-test';
    process.env['NOTION_B2C_GROWTH_HUB_DATABASE_ID'] = 'database-b2c';
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ results: [{ id: 'page-existing', url: 'https://notion.so/b2c-existing' }] })
    );
    fetchMock.mockResolvedValueOnce(
      jsonResponse(
        notionPageWithStage('page-existing', 'Closed Won', 'https://notion.so/b2c-existing')
      )
    );
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ id: 'page-existing', url: 'https://notion.so/b2c-existing' })
    );
    fetchMock.mockResolvedValueOnce(
      jsonResponse(
        notionPageWithStage('page-existing', 'Closed Won', 'https://notion.so/b2c-existing')
      )
    );

    const result = await upsertB2CUsersEntry({
      userId: 'athlete-existing',
      environment: 'production',
      email: 'existing@example.com',
      firstName: 'Jade',
      lastName: 'Cole',
      primarySport: 'Football',
      stage: 'Closed Won',
    });

    expect(result).toEqual({
      status: 'existing',
      pageId: 'page-existing',
      pageUrl: 'https://notion.so/b2c-existing',
    });
    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain('/databases/database-b2c/query');
  });

  it('updates a stored B2C page id before falling back to email lookup', async () => {
    process.env['NOTION_B2C_GROWTH_HUB_ENABLED'] = 'true';
    process.env['NOTION_API_TOKEN'] = 'secret-test';
    process.env['NOTION_B2C_GROWTH_HUB_DATABASE_ID'] = 'database-b2c';
    fetchMock.mockResolvedValueOnce(
      jsonResponse(
        notionPageWithStage('page-known', 'Usage Started', 'https://notion.so/b2c-known')
      )
    );
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ id: 'page-known', url: 'https://notion.so/b2c-known' })
    );
    fetchMock.mockResolvedValueOnce(
      jsonResponse(
        notionPageWithStage('page-known', 'Usage Started', 'https://notion.so/b2c-known')
      )
    );

    const result = await upsertB2CUsersEntry({
      userId: 'athlete-known',
      environment: 'production',
      pageId: 'page-known',
      email: 'existing@example.com',
      firstName: 'Jade',
      lastName: 'Cole',
      primarySport: 'Football',
      stage: 'Usage Started',
    });

    expect(result).toEqual({
      status: 'existing',
      pageId: 'page-known',
      pageUrl: 'https://notion.so/b2c-known',
    });
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain('/pages/page-known');
    expect(fetchMock.mock.calls[0]?.[1]?.method).toBe('GET');
    expect(fetchMock.mock.calls[1]?.[1]?.method).toBe('PATCH');
    expect(
      fetchMock.mock.calls.some(([url]) => String(url).includes('/databases/database-b2c/query'))
    ).toBe(false);
  });

  it('does not downgrade an existing B2C page to a lower lifecycle stage', async () => {
    process.env['NOTION_B2C_GROWTH_HUB_ENABLED'] = 'true';
    process.env['NOTION_API_TOKEN'] = 'secret-test';
    process.env['NOTION_B2C_GROWTH_HUB_DATABASE_ID'] = 'database-b2c';
    fetchMock.mockResolvedValueOnce(
      jsonResponse(
        notionPageWithStage('page-known', 'Usage Started', 'https://notion.so/b2c-known')
      )
    );
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ id: 'page-known', url: 'https://notion.so/b2c-known' })
    );
    fetchMock.mockResolvedValueOnce(
      jsonResponse(
        notionPageWithStage('page-known', 'Usage Started', 'https://notion.so/b2c-known')
      )
    );

    const result = await upsertB2CUsersEntry({
      userId: 'athlete-known',
      environment: 'production',
      pageId: 'page-known',
      email: 'existing@example.com',
      stage: 'Onboarding Completed',
    });

    const patchBody = JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body)) as {
      readonly properties: Record<string, unknown>;
    };

    expect(result).toEqual({
      status: 'existing',
      pageId: 'page-known',
      pageUrl: 'https://notion.so/b2c-known',
    });
    expect(patchBody.properties['Stage']).toBeUndefined();
  });

  it('enriches a created B2C page with state and partner relation when available', async () => {
    process.env['NOTION_B2C_GROWTH_HUB_ENABLED'] = 'true';
    process.env['NOTION_API_TOKEN'] = 'secret-test';
    process.env['NOTION_B2C_GROWTH_HUB_DATABASE_ID'] = 'database-b2c';
    process.env['NOTION_SIGNUP_DASHBOARD_ENABLED'] = 'true';
    process.env['NOTION_SIGNUP_DASHBOARD_DATABASE_ID'] = 'database-b2b';
    process.env['PRODUCTION_NOTION_SIGNUP_DASHBOARD_DATABASE_ID'] = 'database-b2b';

    fetchMock.mockResolvedValueOnce(
      jsonResponse({ results: [{ id: 'partner-page', url: 'https://notion.so/partner-page' }] })
    );
    fetchMock.mockResolvedValueOnce(jsonResponse({ results: [] }));
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ id: 'b2c-page', url: 'https://notion.so/b2c-page' })
    );
    fetchMock.mockResolvedValueOnce(jsonResponse(notionPageWithStage('b2c-page', 'Closed Won')));
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        id: 'b2c-page',
        url: 'https://notion.so/b2c-page',
        properties: {
          State: { type: 'rich_text', rich_text: [] },
          Partner: { type: 'relation', relation: [] },
        },
      })
    );
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ id: 'b2c-page', url: 'https://notion.so/b2c-page' })
    );

    const result = await upsertB2CUsersEntry({
      userId: 'athlete-new',
      environment: 'production',
      email: 'new@example.com',
      firstName: 'Jade',
      lastName: 'Cole',
      state: 'OH',
      referralClubName: 'Akron East',
      stage: 'Closed Won',
      ltvDollars: 123.45,
      usageRevenueMonthlyDollars: 67.89,
    });

    expect(result).toEqual({
      status: 'created',
      pageId: 'b2c-page',
      pageUrl: 'https://notion.so/b2c-page',
    });

    const relationPatchCall = fetchMock.mock.calls.find(([, init]) => {
      const body = typeof init?.body === 'string' ? JSON.parse(init.body) : null;
      return body?.properties?.['Partner'];
    });

    expect(relationPatchCall).toBeTruthy();

    const relationPatchBody = JSON.parse(String(relationPatchCall?.[1]?.body));
    expect(relationPatchBody.properties['State']).toEqual({
      rich_text: [{ type: 'text', text: { content: 'OH' } }],
    });
    expect(relationPatchBody.properties['Partner']).toEqual({
      relation: [{ id: 'partner-page' }],
    });
  });
});
