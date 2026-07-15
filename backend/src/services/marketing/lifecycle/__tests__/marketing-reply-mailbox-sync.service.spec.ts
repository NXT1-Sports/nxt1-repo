import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { syncAllUserEmailsMock } = vi.hoisted(() => ({
  syncAllUserEmailsMock: vi.fn(),
}));

vi.mock('../../../communications/connected-mail.service.js', () => ({
  syncAllUserEmails: syncAllUserEmailsMock,
}));

import {
  resolveMarketingReplyMailboxEmail,
  syncMarketingReplyMailbox,
} from '../marketing-reply-mailbox-sync.service.js';

describe('marketing-reply-mailbox-sync.service', () => {
  const originalEnv = {
    marketingReplyMailboxes: process.env['MARKETING_REPLY_MAILBOXES'],
    platformFromEmail: process.env['PLATFORM_FROM_EMAIL'],
    supportEmail: process.env['SUPPORT_EMAIL'],
  };

  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env['MARKETING_REPLY_MAILBOXES'];
    delete process.env['PLATFORM_FROM_EMAIL'];
    delete process.env['SUPPORT_EMAIL'];
  });

  afterEach(() => {
    process.env['MARKETING_REPLY_MAILBOXES'] = originalEnv.marketingReplyMailboxes;
    process.env['PLATFORM_FROM_EMAIL'] = originalEnv.platformFromEmail;
    process.env['SUPPORT_EMAIL'] = originalEnv.supportEmail;
  });

  it('prefers the configured marketing reply mailbox list before platform and support mailboxes', () => {
    process.env['MARKETING_REPLY_MAILBOXES'] = 'replies@nxt1sports.com, nxt1@nxt1sports.com';
    process.env['PLATFORM_FROM_EMAIL'] = 'nxt1@nxt1sports.com';
    process.env['SUPPORT_EMAIL'] = 'john@nxt1sports.com';

    expect(resolveMarketingReplyMailboxEmail()).toBe('replies@nxt1sports.com');
  });

  it('falls back to the platform sender before support email', () => {
    process.env['PLATFORM_FROM_EMAIL'] = 'nxt1@nxt1sports.com';
    process.env['SUPPORT_EMAIL'] = 'john@nxt1sports.com';

    expect(resolveMarketingReplyMailboxEmail()).toBe('nxt1@nxt1sports.com');
  });

  it('syncs the mailbox user for the resolved marketing mailbox', async () => {
    process.env['PLATFORM_FROM_EMAIL'] = 'nxt1@nxt1sports.com';
    process.env['SUPPORT_EMAIL'] = 'john@nxt1sports.com';

    const getMock = vi.fn().mockResolvedValue({
      empty: false,
      docs: [{ id: 'mailbox-user-1' }],
    });
    const whereMock = vi.fn().mockReturnValue({
      limit: vi.fn().mockReturnValue({
        get: getMock,
      }),
    });
    const collectionMock = vi.fn().mockReturnValue({ where: whereMock });
    const db = {
      collection: collectionMock,
    } as unknown as Parameters<typeof syncMarketingReplyMailbox>[0]['db'];

    syncAllUserEmailsMock.mockResolvedValue({
      gmail: { synced: 3, skipped: 0, errors: 0 },
    });

    const result = await syncMarketingReplyMailbox({ db });

    expect(collectionMock).toHaveBeenCalledWith('Users');
    expect(whereMock).toHaveBeenCalledWith('email', '==', 'nxt1@nxt1sports.com');
    expect(syncAllUserEmailsMock).toHaveBeenCalledWith('mailbox-user-1', db);
    expect(result).toEqual({
      status: 'synced',
      mailboxUserId: 'mailbox-user-1',
      mailboxEmail: 'nxt1@nxt1sports.com',
      results: {
        gmail: { synced: 3, skipped: 0, errors: 0 },
      },
    });
  });
});
