import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockFindPayments = vi.fn();

vi.mock('../../../../models/billing/payment-log.model.js', () => ({
  PaymentLogModel: {
    find: mockFindPayments,
  },
}));

vi.mock('../../../../config/database.config.js', () => ({
  ensureMongoDBConnected: vi.fn(async () => undefined),
}));

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function createFirestoreMock() {
  const organizationsDocGet = vi.fn().mockResolvedValue({
    exists: true,
    data: () => ({ billingOwnerUid: 'owner_1', billingEmail: 'owner@org.com' }),
  });
  const usersDocGet = vi.fn((userId?: string) => {
    if (userId === 'owner_1') {
      return Promise.resolve({
        exists: true,
        data: () => ({ email: 'owner@org.com', lifecycle: { sales: {} } }),
      });
    }

    if (userId === 'user_1') {
      return Promise.resolve({
        exists: true,
        data: () => ({
          email: 'athlete1@org.com',
          contact: { email: 'athlete1@org.com' },
          lifecycle: { sales: {} },
        }),
      });
    }

    if (userId === 'user_2') {
      return Promise.resolve({
        exists: true,
        data: () => ({
          email: 'athlete2@org.com',
          contact: { email: 'athlete2@org.com' },
          lifecycle: { sales: {} },
        }),
      });
    }

    return Promise.resolve({ exists: false, data: () => undefined });
  });

  return {
    collection: vi.fn((name: string) => {
      if (name === 'Organizations') {
        return {
          limit: vi.fn().mockReturnThis(),
          get: vi.fn().mockResolvedValue({ docs: [{ id: 'org_1', data: () => ({}) }] }),
          doc: vi.fn(() => ({ get: organizationsDocGet })),
        };
      }

      if (name === 'Teams') {
        return {
          where: vi.fn().mockReturnValue({
            select: vi.fn().mockReturnValue({
              get: vi.fn().mockResolvedValue({
                docs: [{ data: () => ({ athleteMember: 2, panelMember: 1 }) }],
              }),
            }),
          }),
        };
      }

      if (name === 'RosterEntries') {
        return {
          where: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              get: vi.fn().mockResolvedValue({
                docs: [
                  { data: () => ({ userId: 'user_1' }) },
                  { data: () => ({ userId: 'user_2' }) },
                ],
              }),
            }),
          }),
        };
      }

      if (name === 'Users') {
        return {
          doc: vi.fn((userId: string) => ({ get: () => usersDocGet(userId) })),
        };
      }

      throw new Error(`Unexpected collection: ${name}`);
    }),
  };
}

describe('b2b-member-count-notion-dashboard.service', () => {
  const fetchMock = vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('fetch', fetchMock);
    process.env['NOTION_SIGNUP_DASHBOARD_ENABLED'] = 'true';
    process.env['NOTION_B2C_GROWTH_HUB_ENABLED'] = 'true';
    process.env['NOTION_API_TOKEN'] = 'secret-test';
    process.env['NOTION_SIGNUP_DASHBOARD_DATABASE_ID'] = 'database-b2b';
    process.env['NOTION_B2C_GROWTH_HUB_DATABASE_ID'] = 'database-b2c';
    mockFindPayments.mockReturnValue({
      select: vi.fn().mockReturnValue({
        lean: vi.fn().mockReturnValue({
          exec: vi.fn().mockResolvedValue([]),
        }),
      }),
    });
  });

  it('reconciles the Members relation with all linked B2C users for an organization', async () => {
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse({ results: [{ id: 'page-b2b', url: 'https://notion.so/page-b2b' }] })
      )
      .mockResolvedValueOnce(
        jsonResponse({
          id: 'page-b2b',
          properties: {
            '# Members': { type: 'number', number: 0 },
            Members: { type: 'relation', relation: [] },
            'Lifetime Deal Value': { type: 'number', number: 0 },
          },
        })
      )
      .mockResolvedValueOnce(jsonResponse({ results: [{ id: 'b2c-user-1' }] }))
      .mockResolvedValueOnce(jsonResponse({ results: [{ id: 'b2c-user-2' }] }))
      .mockResolvedValueOnce(jsonResponse({ results: [{ id: 'b2c-owner' }] }))
      .mockResolvedValueOnce(jsonResponse({ id: 'page-b2b', url: 'https://notion.so/page-b2b' }));

    const { runB2BMemberCountNotionDashboardSync } =
      await import('../b2b-member-count-notion-dashboard.service.js');
    const result = await runB2BMemberCountNotionDashboardSync({
      db: createFirestoreMock() as never,
      limit: 1,
    });

    expect(result.updatedCount).toBe(1);
    expect(result.results[0]?.relatedMemberCount).toBe(3);

    const patchCall = fetchMock.mock.calls.find(([, init]) => {
      return (
        init?.method === 'PATCH' &&
        typeof init?.body === 'string' &&
        String(init.body).includes('"Members"') &&
        String(init.body).includes('b2c-user-1') &&
        String(init.body).includes('b2c-user-2') &&
        String(init.body).includes('b2c-owner')
      );
    });

    expect(patchCall).toBeTruthy();
  });
});
