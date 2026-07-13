import { beforeEach, describe, expect, it, vi } from 'vitest';

const { upsertB2BOutboundLeadMock, upsertInvestorsPartnershipLeadMock } = vi.hoisted(() => ({
  upsertB2BOutboundLeadMock: vi.fn(),
  upsertInvestorsPartnershipLeadMock: vi.fn(),
}));

vi.mock('../../integrations/notion/signup-dashboard-entry.service.js', () => ({
  upsertB2BOutboundLead: upsertB2BOutboundLeadMock,
}));

vi.mock('../../integrations/notion/investors-partnerships-entry.service.js', () => ({
  upsertInvestorsPartnershipLead: upsertInvestorsPartnershipLeadMock,
}));

import { suppressMarketingRepliesForInboundMessage } from '../marketing-reply-suppression.service.js';

type CollectionRecord = Record<string, Record<string, unknown>>;

function mergeData(
  current: Record<string, unknown>,
  update: Record<string, unknown>
): Record<string, unknown> {
  const next = { ...current };
  for (const [key, value] of Object.entries(update)) {
    if (
      value &&
      typeof value === 'object' &&
      !Array.isArray(value) &&
      current[key] &&
      typeof current[key] === 'object' &&
      !Array.isArray(current[key])
    ) {
      next[key] = mergeData(
        current[key] as Record<string, unknown>,
        value as Record<string, unknown>
      );
    } else {
      next[key] = value;
    }
  }
  return next;
}

function createFirestoreMock(initial: Record<string, CollectionRecord>) {
  const collections = new Map<string, Map<string, Record<string, unknown>>>(
    Object.entries(initial).map(([name, docs]) => [name, new Map(Object.entries(docs))])
  );

  return {
    collection(name: string) {
      const collection = collections.get(name) ?? new Map<string, Record<string, unknown>>();
      collections.set(name, collection);

      return {
        where(field: string, _operator: string, value: unknown) {
          return {
            async get() {
              const docs = [...collection.entries()]
                .filter(([, data]) => data[field] === value)
                .map(([id, data]) => ({
                  id,
                  data: () => ({ ...data }),
                  ref: {
                    async set(update: Record<string, unknown>, options?: { merge?: boolean }) {
                      const existing = collection.get(id) ?? {};
                      collection.set(id, options?.merge ? mergeData(existing, update) : update);
                    },
                  },
                }));

              return {
                size: docs.length,
                empty: docs.length === 0,
                docs,
              };
            },
          };
        },
      };
    },
    read(collectionName: string, id: string) {
      return collections.get(collectionName)?.get(id);
    },
  };
}

describe('suppressMarketingRepliesForInboundMessage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('skips non-marketing mailboxes', async () => {
    const db = createFirestoreMock({});

    const result = await suppressMarketingRepliesForInboundMessage({
      db: db as never,
      mailboxEmail: 'athlete@example.com',
      senderEmail: 'lead@example.com',
    });

    expect(result).toEqual({
      status: 'skipped',
      reason: 'non-marketing-mailbox',
      matchedLeads: 0,
      updatedLeads: 0,
      notionUpdates: 0,
    });
    expect(upsertB2BOutboundLeadMock).not.toHaveBeenCalled();
    expect(upsertInvestorsPartnershipLeadMock).not.toHaveBeenCalled();
  });

  it('marks matching B2B and investor leads replied and clears follow-up dates', async () => {
    upsertB2BOutboundLeadMock.mockResolvedValue({
      status: 'created',
      pageId: 'b2b-page',
      pageUrl: 'https://notion.so/b2b-page',
    });
    upsertInvestorsPartnershipLeadMock.mockResolvedValue({
      status: 'existing',
      pageId: 'investor-page',
      pageUrl: 'https://notion.so/investor-page',
    });

    const repliedAt = new Date('2026-07-07T12:00:00.000Z');
    const db = createFirestoreMock({
      MarketingB2BOutboundLeads: {
        'b2b-1': {
          organization: 'Acme Club',
          email: 'reply@example.com',
          primaryContact: 'Sam Coach',
          partnerType: 'Club/Academy',
          sourceUrl: 'https://acme.test',
          touchCount: 2,
          status: 'contacted',
          nextFollowUpAt: '2026-07-09T00:00:00.000Z',
          replied: false,
        },
      },
      MarketingInvestorsPartnershipOutboundLeads: {
        'investor-1': {
          organization: 'Velocity Capital',
          email: 'reply@example.com',
          primaryContact: 'Alex Investor',
          leadType: 'Investor',
          sourceUrl: 'https://velocity.test',
          touchCount: 1,
          status: 'contacted',
          nextFollowUpAt: '2026-07-10T00:00:00.000Z',
          replied: false,
        },
      },
    });

    const result = await suppressMarketingRepliesForInboundMessage({
      db: db as never,
      mailboxEmail: 'support@nxt1sports.com',
      senderEmail: 'reply@example.com',
      repliedAt,
      subject: 'Re: NXT1 intro',
      provider: 'gmail',
      externalThreadId: 'thread-123',
    });

    expect(result).toEqual({
      status: 'processed',
      matchedLeads: 2,
      updatedLeads: 2,
      notionUpdates: 2,
    });

    expect(db.read('MarketingB2BOutboundLeads', 'b2b-1')).toMatchObject({
      status: 'replied',
      replied: true,
      repliedAt: repliedAt.toISOString(),
      nextFollowUpAt: null,
      updatedAt: repliedAt.toISOString(),
    });
    expect(db.read('MarketingInvestorsPartnershipOutboundLeads', 'investor-1')).toMatchObject({
      status: 'replied',
      replied: true,
      repliedAt: repliedAt.toISOString(),
      nextFollowUpAt: null,
      updatedAt: repliedAt.toISOString(),
    });

    expect(upsertB2BOutboundLeadMock).toHaveBeenCalledWith(
      expect.objectContaining({
        organization: 'Acme Club',
        email: 'reply@example.com',
        stage: 'Replied',
        nextFollowUpAt: null,
      })
    );
    expect(upsertInvestorsPartnershipLeadMock).toHaveBeenCalledWith(
      expect.objectContaining({
        organization: 'Velocity Capital',
        email: 'reply@example.com',
        stage: 'Replied',
        nextFollowUpAt: null,
      })
    );
  });
});
