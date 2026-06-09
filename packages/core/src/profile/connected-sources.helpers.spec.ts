/**
 * @fileoverview Connected Sources Helpers Unit Tests
 * @module @nxt1/core/profile
 *
 * Pure function tests — no TestBed, no Angular.
 */

import { describe, expect, it } from 'vitest';
import {
  buildLinkSourcesFormData,
  mapToConnectedSources,
  mapConnectedEmailsToLinkSources,
  mapConnectedSourcesToLinkSources,
  mapFirebaseProvidersToLinkSources,
  connectedSourceKey,
  mergeLinkSources,
  mergeConnectedSources,
} from './connected-sources.helpers';
import type { ConnectedSource } from '../models/user/user-base.model';

describe('mapToConnectedSources', () => {
  it('should map connected entries with URLs', () => {
    const entries = [
      { platform: 'hudl', connected: true, url: 'https://hudl.com/p/1' },
      { platform: 'twitter', connected: true, url: 'https://twitter.com/user' },
    ];

    const result = mapToConnectedSources(entries);

    expect(result).toEqual([
      {
        faviconUrl: 'https://www.google.com/s2/favicons?domain=hudl.com&sz=64',
        platform: 'hudl',
        profileUrl: 'https://hudl.com/p/1',
        scopeType: undefined,
        scopeId: undefined,
      },
      {
        faviconUrl: 'https://www.google.com/s2/favicons?domain=x.com&sz=64',
        platform: 'x',
        profileUrl: 'https://twitter.com/user',
        scopeType: undefined,
        scopeId: undefined,
      },
    ]);
  });

  it('should filter out disconnected entries', () => {
    const entries = [
      { platform: 'hudl', connected: false, url: 'https://hudl.com/p/1' },
      { platform: 'twitter', connected: true, url: 'https://twitter.com/user' },
    ];

    const result = mapToConnectedSources(entries);
    expect(result).toHaveLength(1);
    expect(result[0].platform).toBe('x');
  });

  it('should filter out entries with empty URLs', () => {
    const entries = [
      { platform: 'hudl', connected: true, url: '' },
      { platform: 'twitter', connected: true, url: '  ' },
      { platform: 'instagram', connected: true, url: 'https://instagram.com/user' },
    ];

    const result = mapToConnectedSources(entries);
    expect(result).toHaveLength(1);
    expect(result[0].platform).toBe('instagram');
  });

  it('should handle empty array', () => {
    expect(mapToConnectedSources([])).toEqual([]);
  });

  it('should preserve scopeType and scopeId', () => {
    const entries = [
      {
        platform: 'hudl',
        connected: true,
        url: 'https://hudl.com',
        scopeType: 'sport' as const,
        scopeId: 'football',
      },
    ];

    const result = mapToConnectedSources(entries);
    expect(result[0].scopeType).toBe('sport');
    expect(result[0].scopeId).toBe('football');
  });

  it('should dedupe twitter/x aliases that point to the same account URL', () => {
    const entries = [
      { platform: 'twitter', connected: true, url: 'https://twitter.com/TheHillTTHLFB' },
      { platform: 'x', connected: true, url: 'https://x.com/TheHillTTHLFB/' },
    ];

    const result = mapToConnectedSources(entries);

    expect(result).toHaveLength(1);
    expect(result[0].platform).toBe('x');
    expect(result[0].profileUrl).toBe('https://x.com/TheHillTTHLFB/');
  });
});

describe('connectedSourceKey', () => {
  it('should create key with platform and scope', () => {
    const source: ConnectedSource = {
      platform: 'hudl',
      profileUrl: 'https://hudl.com/p/1',
      scopeType: 'sport',
      scopeId: 'football',
    };

    expect(connectedSourceKey(source)).toBe('hudl|sport|football');
  });

  it('should default scopeType to global when undefined', () => {
    const source: ConnectedSource = {
      platform: 'twitter',
      profileUrl: 'https://twitter.com/user',
    };

    expect(connectedSourceKey(source)).toBe('x|global|');
  });
});

describe('mergeConnectedSources', () => {
  it('should merge without duplicates', () => {
    const existing: ConnectedSource[] = [
      {
        platform: 'hudl',
        profileUrl: 'https://hudl.com/old',
        scopeType: 'sport',
        scopeId: 'football',
      },
      { platform: 'twitter', profileUrl: 'https://twitter.com/old' },
    ];

    const incoming: ConnectedSource[] = [
      {
        platform: 'hudl',
        profileUrl: 'https://hudl.com/new',
        scopeType: 'sport',
        scopeId: 'football',
      },
      { platform: 'instagram', profileUrl: 'https://instagram.com/new' },
    ];

    const result = mergeConnectedSources(existing, incoming);

    expect(result).toHaveLength(3);
    // hudl should be overwritten by incoming
    const hudl = result.find((s: ConnectedSource) => s.platform === 'hudl');
    expect(hudl?.profileUrl).toBe('https://hudl.com/new');
    // x preserved (twitter aliases canonicalized)
    expect(result.find((s: ConnectedSource) => s.platform === 'x')).toBeDefined();
    // instagram added
    expect(result.find((s: ConnectedSource) => s.platform === 'instagram')).toBeDefined();
  });

  it('should handle empty existing', () => {
    const incoming: ConnectedSource[] = [{ platform: 'hudl', profileUrl: 'https://hudl.com/new' }];

    const result = mergeConnectedSources([], incoming);
    expect(result).toHaveLength(1);
  });

  it('should handle empty incoming', () => {
    const existing: ConnectedSource[] = [{ platform: 'hudl', profileUrl: 'https://hudl.com/old' }];

    const result = mergeConnectedSources(existing, []);
    expect(result).toHaveLength(1);
  });
});

describe('buildLinkSourcesFormData', () => {
  it('should map canonical connected sources into link rows', () => {
    const result = buildLinkSourcesFormData({
      connectedSources: [
        {
          platform: 'hudl',
          profileUrl: 'https://hudl.com/p/123',
          scopeType: 'sport',
          scopeId: 'football',
        },
      ],
    });

    expect(result).toEqual({
      links: [
        {
          platform: 'hudl',
          connected: true,
          connectionType: 'link',
          url: 'https://hudl.com/p/123',
          scopeType: 'sport',
          scopeId: 'football',
        },
      ],
    });
  });

  it('should ignore firebase-only sign-in providers after a backend disconnect', () => {
    const result = buildLinkSourcesFormData({
      firebaseProviders: [{ providerId: 'google.com' }],
      connectedEmails: [
        { provider: 'gmail', isActive: false },
        { provider: 'microsoft', isActive: true },
      ],
    });

    expect(result).toEqual({
      links: [
        {
          platform: 'microsoft',
          connected: true,
          connectionType: 'signin',
          scopeType: 'global',
        },
      ],
    });
  });
});

describe('mapConnectedSourcesToLinkSources', () => {
  it('should preserve scope metadata', () => {
    expect(
      mapConnectedSourcesToLinkSources([
        {
          platform: 'maxpreps',
          profileUrl: 'https://maxpreps.com/team',
          scopeType: 'team',
          scopeId: 'team-1',
        },
      ])
    ).toEqual([
      {
        platform: 'maxpreps',
        connected: true,
        connectionType: 'link',
        url: 'https://maxpreps.com/team',
        scopeType: 'team',
        scopeId: 'team-1',
      },
    ]);
  });

  it('should map canonical x platform to twitter for linked UI rows and round-trip back to x', () => {
    const linkRows = mapConnectedSourcesToLinkSources([
      {
        platform: 'x',
        profileUrl: 'https://x.com/GreenwoodFball',
        scopeType: 'sport',
        scopeId: 'football',
      },
    ]);

    expect(linkRows).toEqual([
      {
        platform: 'twitter',
        connected: true,
        connectionType: 'link',
        url: 'https://x.com/GreenwoodFball',
        scopeType: 'global',
        scopeId: undefined,
      },
    ]);

    const roundTripped = mapToConnectedSources(linkRows);
    expect(roundTripped).toHaveLength(1);
    expect(roundTripped[0].platform).toBe('x');
  });

  it('should coerce x stored with sport scope to global twitter row for UI key matching', () => {
    const linkRows = mapConnectedSourcesToLinkSources([
      {
        platform: 'x',
        profileUrl: 'https://x.com/GreenwoodFball',
        scopeType: 'sport',
        scopeId: 'football',
      },
    ]);

    expect(linkRows).toEqual([
      {
        platform: 'twitter',
        connected: true,
        connectionType: 'link',
        url: 'https://x.com/GreenwoodFball',
        scopeType: 'global',
        scopeId: undefined,
      },
    ]);
  });

  it('should preserve addedBy attribution and connected flag for connected-accounts display', () => {
    const linkRows = mapConnectedSourcesToLinkSources([
      {
        platform: 'hudl',
        profileUrl: 'https://hudl.com/team/123',
        connected: true,
        addedBy: 'John Keller',
        addedById: 'roD9tny1CKeQCkbESUH17ovQMYk1',
        scopeType: 'sport',
        scopeId: 'football',
      },
    ]);

    expect(linkRows).toEqual([
      {
        platform: 'hudl',
        connected: true,
        connectionType: 'link',
        url: 'https://hudl.com/team/123',
        addedBy: 'John Keller',
        addedById: 'roD9tny1CKeQCkbESUH17ovQMYk1',
        scopeType: 'sport',
        scopeId: 'football',
      },
    ]);
  });
});

describe('mapFirebaseProvidersToLinkSources', () => {
  it('should map supported firebase providers to sign-in links', () => {
    expect(
      mapFirebaseProvidersToLinkSources([
        { providerId: 'google.com' },
        { providerId: 'microsoft.com' },
        { providerId: 'password' },
      ])
    ).toEqual([
      {
        platform: 'google',
        connected: true,
        connectionType: 'signin',
        scopeType: 'global',
      },
      {
        platform: 'microsoft',
        connected: true,
        connectionType: 'signin',
        scopeType: 'global',
      },
    ]);
  });
});

describe('mapConnectedEmailsToLinkSources', () => {
  it('should skip inactive emails and already-connected firebase providers', () => {
    expect(
      mapConnectedEmailsToLinkSources(
        [
          { provider: 'gmail', isActive: true },
          { provider: 'microsoft', isActive: false },
          { provider: 'microsoft', isActive: true },
        ],
        ['google']
      )
    ).toEqual([
      {
        platform: 'microsoft',
        connected: true,
        connectionType: 'signin',
        scopeType: 'global',
      },
    ]);
  });
});

describe('mergeLinkSources', () => {
  it('should preserve separate sign-in and link entries for the same platform', () => {
    expect(
      mergeLinkSources(
        [
          {
            platform: 'google',
            connected: true,
            connectionType: 'signin',
            scopeType: 'global',
          },
        ],
        [
          {
            platform: 'google',
            connected: true,
            connectionType: 'link',
            url: 'https://google.com/profile',
            scopeType: 'global',
          },
        ]
      )
    ).toEqual([
      {
        platform: 'google',
        connected: true,
        connectionType: 'signin',
        scopeType: 'global',
      },
      {
        platform: 'google',
        connected: true,
        connectionType: 'link',
        url: 'https://google.com/profile',
        scopeType: 'global',
      },
    ]);
  });
});
