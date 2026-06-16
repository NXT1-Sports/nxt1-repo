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
      },
    ];

    const result = buildConnectedAccountsResyncRequest(accounts);

    expect(result.requestedAccounts).toEqual([
      {
        platform: 'maxpreps',
        label: 'maxpreps',
        username: undefined,
        url: 'https://www.maxpreps.com/team',
      },
      {
        platform: 'hudl',
        label: 'hudl',
        username: undefined,
        url: 'https://www.hudl.com/team/123',
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

  it('includes Firecrawl sign-in accounts while excluding OAuth-only providers', () => {
    const result = buildConnectedAccountsResyncRequest([
      {
        platform: 'hudl_signin',
        label: 'Hudl',
        connected: true,
        connectionType: 'signin',
      },
      {
        platform: 'google',
        label: 'Google',
        connected: true,
        connectionType: 'signin',
      },
      {
        platform: 'youtube_signin',
        label: 'YouTube',
        connected: true,
        connectionType: 'signin',
      },
    ]);

    expect(result.requestedAccounts).toEqual([
      {
        platform: 'hudl',
        label: 'Hudl',
        username: undefined,
        url: undefined,
      },
      {
        platform: 'youtube',
        label: 'YouTube',
        username: undefined,
        url: undefined,
      },
    ]);
    expect(result.platformSummary).toBe('Hudl, YouTube');
    expect(result.intent).toContain('Refresh these linked accounts: Hudl, YouTube.');
  });
});
