import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { upsertInvestorsPartnershipLead } from '../investors-partnerships-entry.service.js';

const ORIGINAL_ENV = { ...process.env };

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('investors partnerships Notion entry service', () => {
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

  it('writes Times Contacted back as rich text when the live Notion property uses rich text', async () => {
    process.env['NOTION_INVESTORS_PARTNERSHIPS_ENABLED'] = 'true';
    process.env['NOTION_API_TOKEN'] = 'secret-test';
    process.env['NOTION_INVESTORS_PARTNERSHIPS_DATABASE_ID'] = 'database-1';

    fetchMock
      .mockResolvedValueOnce(
        jsonResponse({ results: [{ id: 'page-existing', url: 'https://notion.so/existing' }] })
      )
      .mockResolvedValueOnce(
        jsonResponse({
          id: 'page-existing',
          url: 'https://notion.so/existing',
          properties: {
            'Times Contacted': {
              type: 'rich_text',
              rich_text: [{ type: 'text', text: { content: '1' }, plain_text: '1' }],
            },
          },
        })
      )
      .mockResolvedValueOnce(
        jsonResponse({ id: 'page-existing', url: 'https://notion.so/existing' })
      )
      .mockResolvedValueOnce(
        jsonResponse({
          id: 'page-existing',
          url: 'https://notion.so/existing',
          properties: {
            'Times Contacted': {
              type: 'rich_text',
              rich_text: [{ type: 'text', text: { content: '1' }, plain_text: '1' }],
            },
            'Last Contacted At': { type: 'date', date: null },
            'Next Follow-Up': { type: 'date', date: null },
          },
        })
      )
      .mockResolvedValueOnce(
        jsonResponse({ id: 'page-existing', url: 'https://notion.so/existing' })
      );

    const result = await upsertInvestorsPartnershipLead({
      environment: 'production',
      organization: 'Acme Ventures',
      email: 'investor@example.com',
      primaryContact: 'Jordan Reed',
      stage: 'Contacted',
      lastContactedAt: new Date('2026-07-06T12:00:00.000Z'),
    });

    const patchCalls = fetchMock.mock.calls.filter(([, init]) => init?.method === 'PATCH');
    const trackingPatchBody = JSON.parse(String(patchCalls[1]?.[1]?.body)) as {
      readonly properties: Record<string, unknown>;
    };

    expect(result).toEqual({
      status: 'existing',
      pageId: 'page-existing',
      pageUrl: 'https://notion.so/existing',
    });
    expect(fetchMock).toHaveBeenCalledTimes(5);
    expect(trackingPatchBody.properties['Times Contacted']).toEqual({
      rich_text: [{ type: 'text', text: { content: '1' } }],
    });
    expect(trackingPatchBody.properties['Last Contacted At']).toEqual({
      date: { start: '2026-07-06T12:00:00.000Z' },
    });
  });

  it('defaults to enabled when investors notion env has token and database but no explicit flag', async () => {
    delete process.env['NOTION_INVESTORS_PARTNERSHIPS_ENABLED'];
    process.env['NOTION_API_TOKEN'] = 'secret-test';
    process.env['NOTION_INVESTORS_PARTNERSHIPS_DATABASE_ID'] = 'database-1';

    fetchMock
      .mockResolvedValueOnce(jsonResponse({ results: [] }))
      .mockResolvedValueOnce(jsonResponse({ results: [] }))
      .mockResolvedValueOnce(jsonResponse({ results: [] }))
      .mockResolvedValueOnce(jsonResponse({ id: 'page-created', url: 'https://notion.so/created' }))
      .mockResolvedValueOnce(
        jsonResponse({
          id: 'page-created',
          url: 'https://notion.so/created',
          properties: {},
        })
      );

    const result = await upsertInvestorsPartnershipLead({
      environment: 'production',
      organization: 'Acme Ventures',
      email: 'investor@example.com',
      primaryContact: 'Jordan Reed',
      stage: 'Replied',
      nextFollowUpAt: null,
    });

    expect(result).toEqual({
      status: 'created',
      pageId: 'page-created',
      pageUrl: 'https://notion.so/created',
    });
    expect(fetchMock).toHaveBeenCalledTimes(5);
  });

  it('writes the Bounced stage for permanently failed outbound leads', async () => {
    process.env['NOTION_INVESTORS_PARTNERSHIPS_ENABLED'] = 'true';
    process.env['NOTION_API_TOKEN'] = 'secret-test';
    process.env['NOTION_INVESTORS_PARTNERSHIPS_DATABASE_ID'] = 'database-1';

    fetchMock
      .mockResolvedValueOnce(jsonResponse({ results: [] }))
      .mockResolvedValueOnce(jsonResponse({ results: [] }))
      .mockResolvedValueOnce(jsonResponse({ results: [] }))
      .mockResolvedValueOnce(jsonResponse({ id: 'page-bounced', url: 'https://notion.so/bounced' }))
      .mockResolvedValueOnce(
        jsonResponse({
          id: 'page-bounced',
          url: 'https://notion.so/bounced',
          properties: {},
        })
      );

    const result = await upsertInvestorsPartnershipLead({
      environment: 'production',
      organization: 'Acme Ventures',
      email: 'bounce@example.com',
      primaryContact: 'Jordan Reed',
      stage: 'Bounced',
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
      pageUrl: 'https://notion.so/bounced',
    });
    expect(createBody.properties['Stage']).toEqual({ status: { name: 'Bounced' } });
    expect(createBody.properties['Next Action']).toEqual({
      rich_text: [
        { type: 'text', text: { content: 'Lead bounced. Automated outbound sequence stopped.' } },
      ],
    });
  });
});
