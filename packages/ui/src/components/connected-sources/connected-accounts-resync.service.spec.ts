import { describe, expect, it } from 'vitest';
import {
  buildConnectedAccountsResyncRequest,
  type ConnectedAccountsResyncSource,
} from './connected-accounts-resync.service';

describe('buildConnectedAccountsResyncRequest', () => {
  it('excludes internal nxt1 sources from the resync request', () => {
    const accounts: ConnectedAccountsResyncSource[] = [
      {
        platform: 'maxpreps',
        label: 'maxpreps',
        url: 'https://www.maxpreps.com/team',
        connected: true,
        scopeType: 'sport',
        scopeId: 'football',
      },
      {
        platform: 'nxt1',
        label: 'nxt1',
        url: 'http://localhost:4200/profile/team-1',
        connected: true,
      },
      {
        platform: 'hudl',
        label: 'hudl',
        url: 'https://www.hudl.com/team/123',
        connected: true,
        scopeType: 'global',
      },
    ];

    const result = buildConnectedAccountsResyncRequest(accounts);

    expect(result.requestedAccounts).toEqual([
      {
        platform: 'maxpreps',
        label: 'maxpreps',
        username: undefined,
        url: 'https://www.maxpreps.com/team',
        scopeType: 'sport',
        scopeId: 'football',
      },
      {
        platform: 'hudl',
        label: 'hudl',
        username: undefined,
        url: 'https://www.hudl.com/team/123',
        scopeType: 'global',
        scopeId: undefined,
      },
    ]);
    expect(result.intent).toContain('Refresh these linked accounts: maxpreps, hudl.');
    expect(result.intent).not.toContain('nxt1');
  });

  it('keeps the fallback intent scoped to external connected accounts only', () => {
    const result = buildConnectedAccountsResyncRequest([
      {
        platform: 'nxt1',
        label: 'nxt1',
        url: 'http://localhost:4200/profile/team-1',
        connected: true,
      },
    ]);

    expect(result.requestedAccounts).toEqual([]);
    expect(result.intent).toContain('external connected accounts');
    expect(result.intent).toContain('externally linked accounts');
  });
});
