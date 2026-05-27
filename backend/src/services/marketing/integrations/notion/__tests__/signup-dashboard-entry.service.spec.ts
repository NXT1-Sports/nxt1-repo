import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  buildSignupDashboardNotionProperties,
  upsertSignupDashboardEntry,
} from '../signup-dashboard-entry.service.js';

const ORIGINAL_ENV = { ...process.env };

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
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

  it('maps completed signup data into the B2B Partners Account Started properties', () => {
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
    expect(properties['Stage']).toEqual({ status: { name: 'Account Started' } });
    expect(properties['Type']).toEqual({ select: { name: 'Other' } });
    expect(properties['Primary Contact']).toEqual({
      rich_text: [{ type: 'text', text: { content: 'Ava Stone' } }],
    });
    expect(properties['Email']).toEqual({ email: 'ava@example.com' });
    expect(properties['Lead Source']).toEqual({ select: { name: 'NXT1 Signup' } });
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
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain('/databases/database-1/query');
  });

  it('creates an Account Started row when no B2B Partners page exists for the signup email', async () => {
    process.env['NOTION_SIGNUP_DASHBOARD_ENABLED'] = 'true';
    process.env['NOTION_API_TOKEN'] = 'secret-test';
    process.env['NOTION_SIGNUP_DASHBOARD_DATABASE_ID'] = 'database-1';
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ results: [] }))
      .mockResolvedValueOnce(
        jsonResponse({ id: 'page-created', url: 'https://notion.so/created' })
      );

    const result = await upsertSignupDashboardEntry({
      userId: 'user-new',
      environment: 'production',
      role: 'coach',
      firstName: 'Jordan',
      lastName: 'Reed',
      email: 'jordan@example.com',
    });

    const createBody = JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body)) as {
      readonly parent: { readonly database_id: string };
      readonly properties: Record<string, unknown>;
    };

    expect(result).toEqual({
      status: 'created',
      pageId: 'page-created',
      pageUrl: 'https://notion.so/created',
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(createBody.parent.database_id).toBe('database-1');
    expect(createBody.properties['Organization']).toEqual({
      title: [{ type: 'text', text: { content: 'Jordan Reed' } }],
    });
    expect(createBody.properties['Stage']).toEqual({ status: { name: 'Account Started' } });
    expect(createBody.properties['Type']).toEqual({ select: { name: 'Other' } });
    expect(createBody.properties['Email']).toEqual({ email: 'jordan@example.com' });
  });
});
